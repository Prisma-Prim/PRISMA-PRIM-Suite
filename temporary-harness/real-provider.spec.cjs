const {createRequire}=require('node:module');
const fs=require('node:fs');
const requireWeb=createRequire('/workspace/work/pr983/source/apps/web/package.json');
const {test,expect}=requireWeb('@playwright/test');
const upstream=requireWeb('@clerk/localizations');
const entry='/accept-invitation?invitation=00000000-0000-4000-8000-000000000658&mode=signin';
const locales=['ro','ru','fr','en'];
const resources={ro:upstream.roRO,ru:upstream.ruRU,fr:upstream.frFR,en:upstream.enUS};
const required={ro:'Introduceți adresa de email.',ru:'Введите адрес электронной почты.',fr:'Saisissez votre adresse e-mail.',en:'Enter your email address.'};
async function choose(page,locale){
 const picker=page.locator('#interface-locale');
 await picker.focus();await picker.press('Enter');await picker.press('Home');
 for(let i=0;i<locales.indexOf(locale);i++)await picker.press('ArrowDown');
 await picker.press('Enter');
 await expect(picker).toHaveAttribute('data-value',locale);await expect(picker).toBeFocused();
}
function guarded(page,record,fault){
 page.on('pageerror',error=>record.pageErrors.push(error.name));
 page.on('requestfailed',request=>{const u=new URL(request.url());record.failedResources.push({host:u.hostname,type:request.resourceType(),reason:request.failure()?.errorText});});
 page.on('request',request=>{const u=new URL(request.url());if(u.hostname==='boss-tarpon-28.clerk.accounts.dev'&&request.resourceType()==='fetch')record.providerFetches.push({method:request.method(),category:u.pathname.includes('/client')?'anonymous-client-initialization':'public-provider-read'});});
 return page.route('**/*',async route=>{
  const request=route.request();const url=new URL(request.url());
  if(/\/(sign_ins|sign_ups|sessions|invitations|oauth)(\/|$)/.test(url.pathname)||url.pathname.startsWith('/api/')){
   record.forbiddenActions.push({host:url.hostname,method:request.method(),category:'auth-or-business-action'});return route.abort();
  }
  if(fault?.active&&url.hostname==='boss-tarpon-28.clerk.accounts.dev'&&request.resourceType()==='script'){
   fault.blocked++;return route.abort();
  }
  return route.continue();
 });
}
test('real anonymous configured form preserves mounted work, keyboard locale, native feedback and continuation',async({page},info)=>{
 const record={source:'7c86aabc200c4b62547341a0c1dbdc57470df3dc',profile:info.project.name,pageErrors:[],failedResources:[],forbiddenActions:[],providerFetches:[],locales:[]};
 await guarded(page,record);
 await page.goto(entry);
 const input=page.locator('.invitation-authentication input[autocomplete="email"]');
 await expect(input).toBeVisible();await expect(page.locator('#interface-locale')).toHaveAttribute('data-value','ro');
 await page.waitForLoadState('networkidle');
 await expect(page.locator('.cl-headerTitle')).toContainText('PRISMA CERT');
 await page.evaluate(()=>{window.__pr983Proof={clerk:window.Clerk,input:document.querySelector('.invitation-authentication input[autocomplete="email"]'),url:location.href,intent:JSON.stringify(history.state)};});
 await input.fill('DEMO-inert-literal');
 for(const locale of locales){
  const before=record.providerFetches.length;
  await choose(page,locale);await page.waitForLoadState('networkidle');
  await expect(input).toHaveValue('DEMO-inert-literal');
  const title=page.locator('.cl-headerTitle');
  await expect(title).toContainText(resources[locale].signIn.start.title.split('{{')[0].trim());
  await expect(title).toContainText('PRISMA CERT');
  const stable=await page.evaluate(()=>({provider:Boolean(window.__pr983Proof.clerk)&&window.__pr983Proof.clerk===window.Clerk,input:window.__pr983Proof.input===document.querySelector('.invitation-authentication input[autocomplete="email"]'),url:window.__pr983Proof.url===location.href,intent:window.__pr983Proof.intent===JSON.stringify(history.state)}));
  expect(stable).toEqual({provider:true,input:true,url:true,intent:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
  expect(record.providerFetches.length-before).toBe(0);
  await input.focus();await expect(input).toBeFocused();
  await page.screenshot({path:info.outputPath(`clerk-${locale}-${info.project.name}-literal.png`),fullPage:true});
  record.locales.push({locale,title:await title.innerText(),stable,noOverflow:!overflow,switchProviderFetches:record.providerFetches.length-before});
 }
 await input.fill('');
 expect(await input.evaluate(element=>element.reportValidity())).toBe(false);
 for(const locale of locales){
  await choose(page,locale);
  await expect(page.locator('.invitation-native-error')).toHaveText(required[locale]);
  expect(await input.evaluate(element=>element.validity.valueMissing)).toBe(true);
  await expect(input).toHaveValue('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.locator('.invitation-native-error').scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath(`clerk-${locale}-${info.project.name}-native-required.png`),fullPage:true});
 }
 expect(record.forbiddenActions).toEqual([]);expect(record.pageErrors).toEqual([]);
 fs.writeFileSync(info.outputPath('sanitized-provider-proof.json'),JSON.stringify(record,null,2)+'\n');
});
test('anonymous SDK-unavailable control recovers after removing only the local fault and reloading',async({page},info)=>{
 const fault={active:true,blocked:0};
 const record={profile:info.project.name,pageErrors:[],failedResources:[],forbiddenActions:[],providerFetches:[],qualification:'Reload recovery; no claim of draft preservation across an unavailable SDK.'};
 await guarded(page,record,fault);await page.goto(entry);
 await expect.poll(()=>fault.blocked).toBeGreaterThan(0);
 await expect(page.locator('.invitation-authentication input')).toHaveCount(0);
 await page.screenshot({path:info.outputPath(`sdk-unavailable-${info.project.name}.png`),fullPage:true});
 fault.active=false;await page.reload();
 await expect(page.locator('.invitation-authentication input[autocomplete="email"]')).toBeVisible();
 await expect(page.locator('.cl-headerTitle')).toContainText('PRISMA CERT');
 await page.screenshot({path:info.outputPath(`sdk-recovered-${info.project.name}.png`),fullPage:true});
 expect(record.forbiddenActions).toEqual([]);
 fs.writeFileSync(info.outputPath('sanitized-recovery-proof.json'),JSON.stringify({...record,blockedScripts:fault.blocked},null,2)+'\n');
});
