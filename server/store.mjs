import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const schema = (await Promise.all(['schema.sql','governance.sql'].map(file=>readFile(new URL(file, import.meta.url),'utf8')))).join('\n');

export async function openStore({ databaseUrl, filename }) {
  if (databaseUrl) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl });
    await pool.query(schema);
    await pool.query(await readFile(new URL('./postgis.sql', import.meta.url), 'utf8'));
    const store = {
      async transaction(fn) {
        const client = await pool.connect();
        const sql = async (s, params = []) => {
          let i = 0;
          return (await client.query(s.replace(/\?/g, () => '$' + ++i), params)).rows;
        };
        try {
          await sql('BEGIN');
          // Serialize membership, aggregate reservations and idempotency across API processes.
          await sql('SELECT pg_advisory_xact_lock(7360360)');
          const value = await fn(sql);
          await sql('COMMIT');
          return value;
        } catch (e) {
          await sql('ROLLBACK');
          throw e;
        } finally { client.release(); }
      },
      postgis: true,
      close: () => pool.end(),
    };
    await migrateMembership(store);return store;
  }

  const { DatabaseSync } = await import('node:sqlite');
  if (filename !== ':memory:') await mkdir(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(schema);
  db.exec("CREATE TRIGGER IF NOT EXISTS ledger_no_edit BEFORE UPDATE ON points_ledger BEGIN SELECT RAISE(ABORT,'Libro inmutable'); END; CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON points_ledger BEGIN SELECT RAISE(ABORT,'Libro inmutable'); END;");
  let last = Promise.resolve();
  const sql = async (s, params = []) => db.prepare(s).all(...params);
  const store = {
    transaction(fn) {
      const current = last.then(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const value = await fn(sql);
          db.exec('COMMIT');
          return value;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      });
      last = current.catch(() => {});
      return current;
    },
    postgis: false,
    close: () => db.close(),
  };
  await migrateMembership(store);return store;
}

async function migrateMembership(store){
  await store.transaction(async sql=>{
    if((await sql("SELECT name FROM secrets WHERE name='membership-v2'")).length)return;
    for(const row of await sql('SELECT id,profile FROM members')){
      const profile=JSON.parse(row.profile);
      if(profile.dniRegistered!==undefined)continue;
      profile.dniRegistered=false;
      profile.verified=profile.roles.includes('coordinador')?1:0;
      profile.residencyVerifiedAt='';
      await sql('UPDATE members SET profile=? WHERE id=?',[JSON.stringify(profile),row.id]);
    }
    await sql("INSERT INTO secrets(name,value) VALUES('membership-v2','1')");
  });
}
