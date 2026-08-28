import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport:{width:1280,height:800} });
p.on("console",m=>console.log("[console."+m.type()+"]", m.text().slice(0,400)));
p.on("pageerror",e=>console.log("[pageerror]", String(e).slice(0,900)));
p.on("requestfailed", r=>console.log("[reqfail]", r.url().slice(0,120), r.failure()?.errorText));
await p.goto("http://127.0.0.1:8080/", { waitUntil:"domcontentloaded", timeout:60000 });
for (let i=0;i<8;i++){
  await p.waitForTimeout(3000);
  const st = await p.evaluate(()=>({ sky: !!window.__skyline, r3f: window.__r3f ?? null }));
  console.log(i, JSON.stringify(st));
  if (st.sky) break;
}
await b.close();
