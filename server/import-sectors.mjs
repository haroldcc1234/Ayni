import {readFile} from 'node:fs/promises';
import {openStore} from './store.mjs';
import {check} from './auth.mjs';

if(!process.env.DATABASE_URL || !process.argv[2])throw Error('Define DATABASE_URL y pasa la ruta de un GeoJSON municipal.');
const data=JSON.parse(await readFile(process.argv[2],'utf8'));
check(data.type==='FeatureCollection' && data.features?.length,'Se requiere una colección de polígonos.');
const store=await openStore({databaseUrl:process.env.DATABASE_URL});
try{
  await store.transaction(async sql=>{
    for(const feature of data.features){
      const {district,id,name}=feature.properties || {};
      check(typeof district==='string' && district.trim() && typeof name==='string' && name.trim() && /^[a-zA-Z0-9_-]{1,80}$/.test(id) && ['Polygon','MultiPolygon'].includes(feature.geometry?.type),'Cada sector requiere distrito, identificador, nombre y polígono.');
      check(!(await sql('SELECT id FROM members WHERE district=? LIMIT 1',[district])).length,'Importa los sectores antes de inscribir vecinos en ese distrito.');
      const geo=JSON.stringify(feature.geometry);
      const [shape]=await sql('SELECT ST_IsValid(g) AND NOT ST_IsEmpty(g) AND ST_SRID(g)=4326 AND ST_CoveredBy(g,ST_MakeEnvelope(-180,-90,180,90,4326)) AS valid FROM (SELECT ST_GeomFromGeoJSON(?) AS g) t',[geo]);
      check(shape.valid,'Geometría WGS84 inválida.');
      check(!(await sql("SELECT id FROM sector_shapes WHERE district=? AND ST_Relate(boundary,ST_GeomFromGeoJSON(?),'T********') LIMIT 1",[district,geo])).length,'Hay sectores superpuestos.');
      await sql('INSERT INTO sector_shapes(district,id,name,boundary) VALUES(?,?,?,ST_Multi(ST_GeomFromGeoJSON(?)))',[district,id,name,geo]);
    }
  });
  console.log(data.features.length+' sectores importados.');
}finally{await store.close();}
