import { chromium } from "playwright";
const out = process.argv[2] || "shot.png";
const script = process.argv[3];
const wait = Number(process.argv[4] ?? 3000);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args:["--use-gl=swiftshader","--enable-unsafe-swiftshader","--disable-gpu-sandbox"] });
const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:1 });
const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,300));}); p.on("pageerror",e=>errs.push(String(e).slice(0,300)));
const t0=Date.now();
await p.goto("http://127.0.0.1:8080/", { waitUntil:"load", timeout:60000 });
await p.waitForTimeout(4000);
console.log("load+4s ms:", Date.now()-t0);
if (script) { await p.evaluate(script); }
await p.waitForTimeout(wait);
await p.screenshot({ path: out });
console.log("errors:", JSON.stringify(errs.slice(0,6)));
console.log("r3f:", JSON.stringify(await p.evaluate(()=> (window).__r3f ?? null)));
console.log("snap:", JSON.stringify(await p.evaluate(()=> { const s=(window).__skyline; return s? {pop:s.pop, money:s.money, b:s.snapshot().buildings, roads:s.snapshot().roads}:null; })));
await b.close();
