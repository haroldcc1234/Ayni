CREATE EXTENSION IF NOT EXISTS postgis;
CREATE OR REPLACE FUNCTION prevent_ledger_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Libro inmutable'; END; $$;
CREATE OR REPLACE TRIGGER ledger_no_edit BEFORE UPDATE OR DELETE OR TRUNCATE ON points_ledger
FOR EACH STATEMENT EXECUTE FUNCTION prevent_ledger_edit();
ALTER TABLE territories ADD COLUMN IF NOT EXISTS boundary geometry(MultiPolygon,4326);
CREATE INDEX IF NOT EXISTS territories_boundary ON territories USING GIST(boundary);

CREATE TABLE IF NOT EXISTS sector_shapes(district TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,boundary geometry(MultiPolygon,4326) NOT NULL,PRIMARY KEY(district,id));
CREATE INDEX IF NOT EXISTS sector_shapes_location ON sector_shapes USING GIST(boundary);
