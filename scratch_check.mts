import { normalizeTeamName, ageGroupFromName } from "./packages/core/src/slug.ts";
function eligible(targetName, targetAge, candidate) {
  const norm = normalizeTeamName(targetName);
  if (normalizeTeamName(candidate.name) !== norm) return false;
  if (targetAge) {
    const t = targetAge.toUpperCase();
    const candAge = candidate.ageGroup ?? ageGroupFromName(candidate.name);
    if (candAge && candAge.toUpperCase() !== t) return false;
  }
  return true;
}
const cases = [
  ["MBA Navy 11U","U11",{name:"MBA Navy 14U",ageGroup:null},false],
  ["Bulls 9U","U9",{name:"BULLS 14U",ageGroup:null},false],
  ["RA White 11U","U11",{name:"RA White 14U",ageGroup:null},false],
  ["South Valley Players 8U","U8",{name:"South Valley Players 10U",ageGroup:null},false],
  ["Riverdawgs 10U","U10",{name:"Riverdawgs 10U",ageGroup:null},true],
  ["Clutch 13U","U13",{name:"Clutch 13U",ageGroup:"U13"},true],
  ["Marshalls 11U","U11",{name:"Marshalls",ageGroup:null},true],
];
let ok = true;
for (const [tn,ta,c,exp] of cases){const got=eligible(tn,ta,c);const pass=got===exp;ok=ok&&pass;console.log(`${pass?"PASS":"FAIL"}  "${tn}" <- "${c.name}" => ${got} (want ${exp})`);}
function renameAge(name,num){const tag=`${num}U`;if(/\b\d{1,2}u\b/i.test(name))return name.replace(/\b\d{1,2}u\b/i,tag);if(/\bu\d{1,2}\b/i.test(name))return name.replace(/\bu\d{1,2}\b/i,tag);return `${name} ${tag}`;}
console.log("rename:", renameAge("MBA Navy 11U",14),"|",renameAge("RA White U11",14),"|",renameAge("Clutch",13));
process.exit(ok?0:1);
