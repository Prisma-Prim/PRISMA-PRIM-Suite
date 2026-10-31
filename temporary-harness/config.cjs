const {createRequire}=require('node:module');
const requireWeb=createRequire('/workspace/work/pr983/source/apps/web/package.json');
const {defineConfig}=requireWeb('@playwright/test');
module.exports=defineConfig({
 testDir:__dirname,testMatch:'*.spec.cjs',outputDir:'/workspace/work/pr983/provider-proof',
 timeout:120000,expect:{timeout:15000},workers:1,retries:0,reporter:'list',
 use:{baseURL:'http://127.0.0.1:4174',locale:'fr-FR',trace:'off',video:'off',
  launchOptions:{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:900}}},{name:'narrow',use:{viewport:{width:390,height:844}}}],
});
