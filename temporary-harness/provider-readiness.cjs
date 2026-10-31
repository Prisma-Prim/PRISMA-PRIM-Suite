const {createRequire}=require('node:module');
const fs=require('node:fs');
const requireWeb=createRequire('/workspace/work/pr983/source/apps/web/package.json');
const {chromium}=requireWeb('@playwright/test');
(async()=>{
 const browser=await chromium.launch({proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}});
 const results=[];
 try {
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:width===390?844:900},locale:'fr-FR'});
   const page=await context.newPage(); const blocked=[]; const errors=[]; const network=[]; const failed=[];
   await page.route('**/*',async route=>{
    const req=route.request();const u=new URL(req.url());
    if(/\/(sign_ins|sign_ups|sessions|invitations|oauth)(\/|$)/.test(u.pathname)){
     blocked.push({host:u.hostname,category:'forbidden-auth-or-invitation-action',method:req.method()});return route.abort();
    }
    return route.continue();
   });
   page.on('pageerror',error=>errors.push(error.name));
   page.on('requestfailed',request=>{const u=new URL(request.url());failed.push({host:u.hostname,reason:request.failure()?.errorText});});
   page.on('response',response=>{const u=new URL(response.url());if(u.hostname==='boss-tarpon-28.clerk.accounts.dev')network.push({host:u.hostname,status:response.status(),resource:response.request().resourceType()});});
   await page.goto('http://127.0.0.1:4174/accept-invitation?invitation=00000000-0000-4000-8000-000000000658&mode=signin');
   const input=page.locator('.invitation-authentication input').first();
   let readinessError;try{await input.waitFor({state:'visible',timeout:20000});}catch(error){readinessError=error.name;}
   const body=(await page.locator('body').innerText()).slice(0,1800);
   await page.screenshot({path:`/workspace/work/pr983/provider-readiness-${width}.png`,fullPage:true});
   const controls=await page.locator('input,select').evaluateAll(elements=>elements.map(e=>({tag:e.tagName,type:e.type,name:e.name,autocomplete:e.autocomplete,label:e.getAttribute('aria-label')})));
   if(blocked.length||errors.length)throw new Error('Unexpected browser/auth action during anonymous readiness');
   results.push({width,body,controls,errors,forbiddenActions:blocked,network,failed,readinessError});
   if(readinessError)throw new Error("Anonymous form not ready; inspect sanitized readiness receipt");
   await context.close();
  }
 } finally {await browser.close();fs.writeFileSync('/workspace/work/pr983/provider-readiness.json',JSON.stringify(results,null,2)+'\n');}
 console.log(JSON.stringify(results,null,2));
})().catch(error=>{console.error(error.name+': '+error.message.replace(/https?:\/\/\S+/g,'[URL omitted]'));process.exitCode=1;});
