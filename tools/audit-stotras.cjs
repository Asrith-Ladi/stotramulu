const fs = require('node:fs');
const vm = require('node:vm');
const dir = 'public/data/stotras';
const context = {window: {}};
vm.createContext(context);
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  vm.runInContext(fs.readFileSync(`${dir}/${file}`, 'utf8'), context, {filename:file});
}
for (const [key, value] of Object.entries(context.window.STOTRAS_DATA)) {
  console.log(JSON.stringify({key, title:value.subtitle, blocks:value.data.length, names:value.data.reduce((n,b)=>n+(b.text.match(/నమః/g)||[]).length,0), labels:value.data.map(b=>b.number), verses:value.data.reduce((n,b)=>n+b.text.split(/\n\s*\n/).filter(Boolean).length,0)}));
}
