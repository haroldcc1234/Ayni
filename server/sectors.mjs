import {check} from './auth.mjs';

// Coordinates use WGS84. A district can opt into polygon coverage before enrollment.
export async function sectorFields(sql,place){
  const [area]=await sql('SELECT id,name FROM sector_shapes WHERE district=? AND ST_Covers(boundary,ST_SetSRID(ST_MakePoint(?,?),4326)) ORDER BY id LIMIT 1',[place.district,place.lng,place.lat]);
  if(!area){
    check(!(await sql('SELECT id FROM sector_shapes WHERE district=? LIMIT 1',[place.district])).length,'Las coordenadas quedan fuera de los sectores habilitados.',422);
    return {};
  }
  const adjacent=await sql('SELECT b.id,b.name FROM sector_shapes a JOIN sector_shapes b ON a.district=b.district AND a.id<>b.id AND ST_Touches(a.boundary,b.boundary) WHERE a.district=? AND a.id=? ORDER BY b.id',[place.district,area.id]);
  const prefix=encodeURIComponent(place.district)+'/zona/';
  return {sectorId:prefix+area.id,sectorName:area.name,adjacentSectors:adjacent.map(b=>({id:prefix+b.id,name:b.name}))};
}
