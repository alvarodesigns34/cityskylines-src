import { chromium } from "playwright";
const out = process.argv[2];
const URL = "https://alvarodesigns34.github.io/cityskylines-src/";
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-certificate-errors"],
  ...(proxy ? { proxy: { server: proxy } } : {}),
});
const p = await b.newPage({ viewport:{width:1280,height:800}, ignoreHTTPSErrors: true });
const errs=[], fails=[];
p.on("pageerror",e=>errs.push(String(e).slice(0,250)));
p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,200));});
p.on("requestfailed",r=>fails.push(r.url().slice(0,120)+" "+(r.failure()?.errorText??"")));
const resp = await p.goto(URL, { waitUntil:"domcontentloaded", timeout:90000 });
console.log("http", resp.status(), "->", p.url());
await p.waitForSelector("text=Fundar una ciudad", { timeout: 90000 });
await p.waitForTimeout(3500);
await p.screenshot({ path: out.replace(".png","-portada.png") });
await p.click("text=Fundar una ciudad");
await p.waitForTimeout(1500);
console.log("partida arranca:", await p.isVisible("text=DEMANDA"));
await p.evaluate(()=>{
  const s=window.__skyline, e=s.entry(), N=64; s.grant(400000);
  for (let x=e.x; x<Math.min(N-3,e.x+20); x++) s.apply("road-street",x,e.z);
  for (let z=Math.max(2,e.z-8); z<=Math.min(N-3,e.z+8); z+=4) for (let x=e.x; x<Math.min(N-3,e.x+20); x++) s.apply("road-street",x,z);
  for (let x=e.x+2; x<Math.min(N-3,e.x+20); x+=4) for (let z=Math.max(2,e.z-8); z<=Math.min(N-3,e.z+8); z++) s.apply("road-street",x,z);
  const place=(k)=>{for(let r=1;r<20;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;const x=e.x+9+dx,z=e.z+dz;s.grant(400000);if(s.canPlace("build:"+k,x,z).ok&&s.apply("build:"+k,x,z))return true;}return false;};
  place("power_coal"); place("water_tower"); place("landfill"); 
  const zs=["zone-r","zone-r","zone-c","zone-i"];
  for (let i=0;i<N*N;i++){const x=i%N,z=(i/N)|0;s.grant(400000);s.apply(zs[(x+z)%4],x,z);}
  s.grant(400000); s.tick(700);
});
await p.waitForTimeout(2500);
console.log("ciudad:", JSON.stringify(await p.evaluate(()=>{const s=window.__skyline.snapshot();return{pop:s.pop,edificios:s.buildings,hito:s.tierName};})));
await p.evaluate(()=>{ window.__skyline.sim.paused=true; window.__skyline.sim.persist(); });
await p.waitForTimeout(400);
await p.reload({ waitUntil:"domcontentloaded" });
await p.waitForSelector("text=Continuar la última ciudad", { timeout: 60000 });
await p.click("text=Continuar la última ciudad");
await p.waitForTimeout(2500);
console.log("tras recargar, edificios:", await p.evaluate(()=>window.__skyline.snapshot().buildings));
await p.screenshot({ path: out });
console.log("peticiones fallidas:", fails.length ? JSON.stringify(fails.slice(0,4)) : "ninguna");
console.log("errores JS:", errs.length ? JSON.stringify(errs.slice(0,4)) : "ninguno");
console.log("r3f:", JSON.stringify(await p.evaluate(()=>window.__r3f)));
await b.close();
