/* Read-only downloads into a gitignored local research cache. */
const fs=require('node:fs');
const sources=require('./reference-sources.json');
fs.mkdirSync('tools/references',{recursive:true});
fs.writeFileSync('tools/references/name-sources.json',JSON.stringify(sources.names,null,2));
fs.writeFileSync('tools/references/other-sources.json',JSON.stringify(sources.other,null,2));
const urls={...sources.texts,...sources.other,...Object.fromEntries(Object.entries(sources.names).map(([k,p])=>[k,'https://sanskritdocuments.org/'+p]))};
(async()=>{
    let failed=false;
    for(const [key,url]of Object.entries(urls)) {
        try {
            const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
            const text=await response.text();
            if(!response.ok||text.length<100)throw Error('HTTP '+response.status+'; missing content');
            fs.writeFileSync('tools/references/'+key+'.html',text);
            console.log(key+': downloaded');
        }catch(error){failed=true;console.error(key+': '+error.message);}
    }
    if(failed)process.exitCode=1;
})();
