const FIELDS=[
['1','BILL OF ENTRY / IMPORT','AUTO:BillOfEntry','readonly',''],
['2','CUSTOMS OFFICE CODE','Identification/Office_segment/Customs_clearance_office_code','',''],
['3','CUSTOMS OFFICE NAME','Identification/Office_segment/Customs_Clearance_office_name','',''],
['4','MANIFEST REFERENCE','Identification/Manifest_reference_number','',''],
['5','REGISTRATION NUMBER','Identification/Registration/Number','',''],
['6','REGISTRATION DATE','Identification/Registration/Date','date',''],
['19','DELIVERY TERM','Transport/Delivery_terms/Code','',''],
['9','EXPORTER NAME','Traders/Exporter/Exporter_name','textarea',''],
['10','CONSIGNEE CODE & NAME','AUTO:ConsigneeCombined','textarea',''],
['12','DECLARANT CODE & NAME','AUTO:DeclarantCombined','textarea',''],
['14','COUNTRY OF EXPORT CODE','General_information/Country/Export/Export_country_code','',''],
['15','COUNTRY OF EXPORT NAME','General_information/Country/Export/Export_country_name','',''],
['16','COUNTRY OF ORIGIN','General_information/Country/Country_of_origin_name','',''],
['17','VESSEL / TRANSPORT IDENTITY','Transport/Means_of_transport/Departure_arrival_information/Identity','',''],
['20','BILL OF LOADING','Item/Previous_doc/Summary_declaration','',''],
['21','BILL OF LOADING DATE','Item/Free_text_2','date',''],
['23','Invoice number & date','AUTO:InvoiceNumberDate','',''],
['27','BANK NAME','Financial/Bank/Name','',''],
['29','BANK REFERENCE','Financial/Bank/Reference','',''],
['30','PAYMENT TERMS','Financial/Terms/Description','',''],
['43','CURRENCY RATE','Valuation/Gs_Invoice/Currency_rate','number',''],
['42','CURRENCY CODE','Valuation/Gs_Invoice/Currency_code','',''],
['32','TOTAL PACKAGES','Property/Nbers/Total_number_of_packages','',''],
['33','PACKAGE KIND','Item/Packages/Kind_of_packages_name','',''],
['37','ITEM NO','AUTO:ItemNo','textarea',''],
['38','COMMERCIAL DESCRIPTION','Item/Goods_description/Commercial_Description','textarea',''],
['34','HS CODE','Item/Tarification/HScode/Commodity_code','textarea',''],
['49','NET WEIGHT','Item/Valuation_item/Weight_itm/Net_weight_itm','textarea',''],
['48','GROSS WEIGHT','Item/Valuation_item/Weight_itm/Gross_weight_itm','textarea',''],
['39','ITEM PRICE (USD)','Item/Tarification/Item_price','textarea',''],
['35','EXTENDED CUSTOMS PROCEDURE','Item/Tarification/Extended_customs_procedure','',''],
['36','NATIONAL CUSTOMS PROCEDURE','Item/Tarification/National_customs_procedure','',''],
['45','OTHER COST (BDT)','Valuation/Gs_other_cost/Amount_national_currency','number',''],
['46','TOTAL INVOICE VALUE','AUTO:TotalInvoiceValue','number',''],
['22','CONTAINER NUMBER','AUTO:ContainerNumber','','']
].map(x=>({no:x[0],label:x[1],path:x[2],type:x[3],value:x[4]}));
let uploadedText='';
let lastParsedExtras={shippingAgent:''};
const ICD_EMAIL_KEY='asycuda_icd_email';
const ICD_PASSWORD_KEY='asycuda_icd_password';
function appServerOrigin(){
 const current=window.location.origin;
 return window.location.port==='3000'?current:'http://localhost:3000';
}
function currentRole(){return String(window.APP_USER_ROLE||document.body?.dataset?.role||'').toLowerCase();}
function canUseSearchTools(){return currentRole()==='programmer';}
function syncSearchToolAccess(){
 const allowed=canUseSearchTools();
 document.querySelectorAll('.programmerOnly').forEach(el=>{el.style.display=allowed?'':'none';});
 const head=document.querySelector('#containerTable thead tr');
 if(head)head.innerHTML=allowed?'<th>SL</th><th>Container Number</th><th>Container Weight</th><th>CPA Search</th><th>ICD Search</th>':'<th>SL</th><th>Container Number</th><th>Container Weight</th>';
}
function clean(v){return (v||'').replace(/\s+/g,' ').trim()}
function xmlValue(doc,path){let node=doc.documentElement,parts=path.split('/');if(parts[0]===node.nodeName)parts.shift();for(const p of parts){if(!node)return'';node=[...node.children].find(ch=>ch.nodeName===p)}if(!node)return'';if([...node.children].some(ch=>ch.nodeName.toLowerCase()==='null'))return'';return clean(node.textContent)}
function xmlValueFrom(node,path){
 let cur=node;
 for(const p of path.split('/')){
  if(!cur)return'';
  cur=[...cur.children].find(ch=>ch.nodeName===p);
 }
 if(!cur)return'';
 if([...cur.children].some(ch=>ch.nodeName.toLowerCase()==='null'))return'';
 return clean(cur.textContent);
}
function extractItemRows(doc){
 const rows=[...doc.getElementsByTagName('Item')].map((item,index)=>({
  itemNo:String(index+1),
  commercialDescription:xmlValueFrom(item,'Goods_description/Commercial_Description'),
  hsCode:xmlValueFrom(item,'Tarification/HScode/Commodity_code'),
  netWeight:xmlValueFrom(item,'Valuation_item/Weight_itm/Net_weight_itm'),
  grossWeight:xmlValueFrom(item,'Valuation_item/Weight_itm/Gross_weight_itm'),
  itemPrice:xmlValueFrom(item,'Tarification/Item_price')
 })).filter(r=>String(r.hsCode||'').trim()!=='0'&&(r.commercialDescription||r.hsCode||r.netWeight||r.grossWeight||r.itemPrice));
 return rows.map((r,i)=>({...r,itemNo:String(i+1)}));
}
function itemFieldValue(items,no){
 const key={
  '37':'itemNo',
  '38':'commercialDescription',
  '34':'hsCode',
  '49':'netWeight',
  '48':'grossWeight',
  '39':'itemPrice'
 }[no];
 return key?items.map(r=>r[key]).filter(Boolean).join('\n'):'';
}
function firstNonEmptyFromItems(doc,path){
 for(const item of [...doc.getElementsByTagName('Item')]){
  const v=xmlValueFrom(item,path);
  if(v)return v;
 }
 return '';
}
function invoiceNumberDateValue(doc){
 const inv=firstNonEmptyFromItems(doc,'Free_text_1')||xmlValue(doc,'Item/Free_text_1');
 const date=formatDateDDMMYYYY(firstNonEmptyFromItems(doc,'Free_text_2')||xmlValue(doc,'Item/Free_text_2'));
 return [inv,date].filter(Boolean).join(' - ');
}
function firstExistingXmlValue(doc,paths){
 for(const path of paths){
  const value=xmlValue(doc,path);
  if(value)return value;
 }
 return '';
}
function shippingAgentValue(doc){
 const byPath=firstExistingXmlValue(doc,[
  'Traders/Shipping_agent/Name',
  'Traders/Shipping_Agent/Name',
  'Traders/Shipping_agent/Shipping_agent_name',
  'Transport/Shipping_agent/Name',
  'Transport/Carrier/Name',
  'Shipping_agent/Name',
  'Shipping_Agent/Name'
 ]);
 if(byPath)return byPath;
 const names=['Shipping_agent_name','Shipping_Agent_name','ShippingAgentName','Carrier_name','CarrierName','Shipping_agent','Shipping_Agent'];
 for(const tag of names){
  for(const node of [...doc.getElementsByTagName(tag)]){
   const value=clean(node.textContent);
   if(value&&!node.querySelector('null'))return value;
  }
 }
 return '';
}
function renderItemTable(items){
 const tb=document.querySelector('#itemDataTable tbody');
 if(!tb)return;
 tb.innerHTML='';
 if(!items.length){tb.innerHTML='<tr><td colspan="6">No Item Data Found</td></tr>';return;}
 const sum=v=>items.reduce((total,r)=>total+(parseFloat(String(r[v]||'').replace(/,/g,''))||0),0);
 const fmt=n=>Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
 items.forEach(r=>{
  tb.insertAdjacentHTML('beforeend',`<tr><td>${esc(r.itemNo||'')}</td><td>${esc(r.commercialDescription||'')}</td><td>${esc(r.hsCode||'')}</td><td>${esc(r.netWeight||'')}</td><td>${esc(r.grossWeight||'')}</td><td>${esc(r.itemPrice||'')}</td></tr>`);
 });
 tb.insertAdjacentHTML('beforeend',`<tr class="itemTotalRow"><td colspan="3">Total</td><td>${esc(fmt(sum('netWeight')))}</td><td>${esc(fmt(sum('grossWeight')))}</td><td>${esc(fmt(sum('itemPrice')))}</td></tr>`);
}
function findContainerNumber(doc){
 const paths=['Containers/Container/Container_number','Containers/Container/Number','Container/Container_number','Container/Number','Transport/Containers/Container/Container_number','Transport/Containers/Container/Number','Transport/Container/Container_number','Transport/Container/Number','Transport/Container_number','Transport/Container_Number','Transport/ContainerNo','Transport/Container_no','Transport/Container_Id','Item/Containers/Container/Container_number','Item/Containers/Container/Number','Item/Container/Container_number','Item/Container/Number','Item/Container_number'];
 for(const p of paths){const v=xmlValue(doc,p);if(v)return{value:v,path:p}}
 const tags=['Container_number','Container_Number','ContainerNo','Container_No','Container_no','ContainerId','Container_ID','Container_Id','CntrNo','Cntr_No','Cntr_number'];
 const vals=[];tags.forEach(t=>[...doc.getElementsByTagName(t)].forEach(n=>{const v=clean(n.textContent);if(v&&!n.querySelector('null'))vals.push(v)}));
 const hits=(clean(new XMLSerializer().serializeToString(doc)).match(/\b[A-Z]{4}\s*\d{7}\b/g)||[]);
 const unique=[...new Set([...vals,...hits].map(v=>v.replace(/\s+/g,'')).filter(v=>/^[A-Z]{4}\d{7}$/.test(v)))];
 return{value:unique.join(', '),path:unique.length?'AUTO:multiple container tag scan':'AUTO:ContainerNumber'};
}
function extractContainers(doc){
 const numberTags=['Container_identity','Container_number','Container_Number','ContainerNo','Container_No','Container_no','ContainerId','Container_ID','Container_Id','CntrNo','Cntr_No','Cntr_number','Number'];
 const goodsWeightTags=['Packages_weight','Goods_weight','Goods_Weight','GoodsWeight','Goods_gross_weight','Goods_Gross_Weight','Goods_net_weight','Goods_Net_Weight','Cargo_weight','Cargo_Weight','CargoWeight','Cargo_gross_weight','Gross_weight_goods','Gross_weight','Net_weight','Weight'];
 function isNullNode(n){return [...n.children].some(ch=>ch.nodeName.toLowerCase()==='null')}
 function directValues(scope,tags){
  const vals=[];
  tags.forEach(t=>[...scope.getElementsByTagName(t)].forEach(n=>{const v=clean(n.textContent);if(v&&!isNullNode(n))vals.push(v)}));
  return vals;
 }
 function parseNumbers(values){
  const out=[];
  values.forEach(raw=>{
   const text=clean(raw);
   [...text.matchAll(/([A-Z]{4})[-\s]?(\d{7})(?:\s*[\/\-]?\s*(20|40)\s*(?:FT|FEET|'|F)?)?/gi)].forEach(m=>{
    const number=(m[1]+'-'+m[2]).toUpperCase();
    const size=m[3]||'';
    if(!out.some(x=>x.number===number))out.push({number,size});
   });
  });
  return out;
 }
 function weightInScope(scope){return directValues(scope,goodsWeightTags).find(Boolean)||''}
 function containerScope(node){
  let cur=node;
  while(cur&&cur!==doc.documentElement){
   const name=(cur.nodeName||'').toLowerCase();
   if(name.includes('container')||name.includes('cntr'))return cur;
   cur=cur.parentElement;
  }
  return node.parentElement||node;
 }
 function nearbyWeight(node){
  const scope=containerScope(node);
  let weight=weightInScope(scope);
  if(weight)return weight;
  let parent=scope.parentElement;
  let depth=0;
  while(parent&&parent!==doc.documentElement&&depth<2){
   weight=weightInScope(parent);
   if(weight)return weight;
   parent=parent.parentElement;depth++;
  }
  return '';
 }
 const rows=[];
 numberTags.forEach(tag=>[...doc.getElementsByTagName(tag)].forEach(node=>{
  if(isNullNode(node))return;
  const nums=parseNumbers([node.textContent]);
  if(!nums.length)return;
  const weight=nearbyWeight(node);
  nums.forEach(n=>{if(!rows.some(r=>r.number===n.number))rows.push({number:n.number,size:n.size,weight});});
 }));
 if(!rows.length){
  const textRows=parseNumbers([new XMLSerializer().serializeToString(doc)]);
  textRows.forEach(n=>rows.push({number:n.number,size:n.size,weight:''}));
 }
 const seen=new Set();
 return rows.filter(r=>{const key=r.number+'|'+r.size;if(seen.has(key))return false;seen.add(key);return true;});
}
function renderContainerTable(doc){
 const showSearch=canUseSearchTools();
 syncSearchToolAccess();
 const tb=document.querySelector('#containerTable tbody');
 const xmlRows=doc?extractContainers(doc):[];
 const weightByNumber=new Map(xmlRows.map(r=>[r.number,r.weight||'']));
 const field22Value=document.querySelector('#entryForm .field[data-no="22"] input, #entryForm .field[data-no="22"] textarea')?.value||'';
 const field22Rows=[];
 [...field22Value.matchAll(/([A-Z]{4})[-\s]?(\d{7})(?:\s*[\/\-]?\s*(20|40)\s*(?:FT|FEET|'|F)?)?/gi)].forEach(m=>{
  const number=(m[1]+'-'+m[2]).toUpperCase();
  const size=m[3]||'';
  if(!field22Rows.some(x=>x.number===number))field22Rows.push({number,size,weight:weightByNumber.get(number)||''});
 });
 const rows=field22Rows.length?field22Rows:xmlRows;
 tb.innerHTML='';
 if(!rows.length){tb.innerHTML=`<tr><td colspan="${showSearch?5:3}">No Container Data Found</td></tr>`;return;}
 rows.forEach((r,i)=>{
  const display=(r.number||'')+(r.size?'/'+r.size+"'":'');
  const cpaNo=cleanContainerForCpa(r.number||display);
  const searchCells=showSearch?`<td><form class="cpaRowSearch programmerOnly" action="https://cpatos.gov.bd/pcs/index.php/Report/mySearchContainerLocation" method="post" target="_blank"><input type="hidden" name="containerLocation" value="${esc(cpaNo)}"><button type="submit" ${cpaNo?'':'disabled'}>Search</button></form></td><td><button type="button" class="icdRowBtn programmerOnly" data-container="${esc(cpaNo)}" onclick="fetchIcdContainer(this)" ${cpaNo?'':'disabled'}>Search</button></td>`:'';
  tb.insertAdjacentHTML('beforeend',`<tr><td>${i+1}</td><td>${esc(display)}</td><td>${esc(r.weight||'')}</td>${searchCells}</tr>`)
 });
}
async function fetchIcdContainer(button){
 if(!canUseSearchTools()){alert('ICD Search sudhu programmer er jonno.');return;}
 const email=document.getElementById('icdEmail')?.value.trim()||'';
 const password=document.getElementById('icdPassword')?.value||'';
 const row=button.closest('tr');
 const container=cleanContainerForCpa(button.dataset.container||row?.children?.[1]?.textContent||'');
 saveIcdCredentials();
 if(!email||!password){alert('ICD E-mail/Password din.');return;}
 if(!container){alert('Container no nei');return;}
 const oldText=button.textContent;
 button.disabled=true;
 button.textContent='Opening...';
 try{
  const form=document.createElement('form');
  form.method='post';
  form.action=appServerOrigin()+'/icd-search-bridge';
  form.target='_blank';
  [['email',email],['password',password],['container',container]].forEach(([name,value])=>{
   const input=document.createElement('input');
   input.type='hidden';
   input.name=name;
   input.value=value;
   form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
 }finally{
  button.disabled=false;
  button.textContent=oldText;
 }
}
function saveIcdCredentials(){
 try{
  const email=document.getElementById('icdEmail')?.value.trim()||'';
  const password=document.getElementById('icdPassword')?.value||'';
  localStorage.setItem(ICD_EMAIL_KEY,email);
  localStorage.setItem(ICD_PASSWORD_KEY,password);
 }catch(e){}
}
function loadIcdCredentials(){
 try{
  const email=document.getElementById('icdEmail');
  const password=document.getElementById('icdPassword');
  if(email)email.value=localStorage.getItem(ICD_EMAIL_KEY)||localStorage.getItem('saifEmail')||'';
  if(password)password.value=localStorage.getItem(ICD_PASSWORD_KEY)||localStorage.getItem('saifPassword')||'';
  email?.addEventListener('input',saveIcdCredentials);
  password?.addEventListener('input',saveIcdCredentials);
 }catch(e){}
}
const fetchSaifContainer=fetchIcdContainer;
function cleanContainerForCpa(value){
 const m=String(value||'').toUpperCase().match(/[A-Z]{4}[-\s]?[0-9]{7}/);
 return m?m[0].replace(/[-\s]/g,''):'';
}
async function fetchCpaLocation(button){
 const row=button.closest('tr');
 const cell=row?row.querySelector('.cpaLocationCell'):null;
 const container=cleanContainerForCpa(button.dataset.container||row?.children?.[1]?.textContent||'');
 if(!container){if(cell)cell.textContent='Container no nei';return;}
 const oldText=button.textContent;
 button.disabled=true;
 button.textContent='Searching...';
 if(cell)cell.textContent='Loading...';
 try{
  const apiUrl=new URL('/api/cpa-location',window.location.origin);
  apiUrl.searchParams.set('container',container);
  const res=await fetch(apiUrl.toString(),{headers:{'Accept':'application/json'},cache:'no-store'});
  const raw=await res.text();
  let data={};
  try{data=raw?JSON.parse(raw):{};}catch(parseError){throw new Error('Server JSON response dei nai. Page refresh korun.');}
  if(!res.ok||data.ok===false)throw new Error(data.error||'CPA search failed');
  if(cell)cell.textContent=data.location||'Not found';
 }catch(e){
  if(cell)cell.textContent='Try again';
  alert('CPA Location ante problem hocche: '+e.message);
 }finally{
  button.disabled=false;
  button.textContent=oldText;
 }
}
function syncCpaSearchFromForm(){
 const cpaInput=document.getElementById('cpaContainerSearch');
 if(!cpaInput)return;
 const tableNumber=document.querySelector('#containerTable tbody tr td:nth-child(2)')?.textContent||'';
 const field22=document.querySelector('#entryForm .field[data-no="22"] input, #entryForm .field[data-no="22"] textarea')?.value||'';
 const value=cleanContainerForCpa(tableNumber)||cleanContainerForCpa(field22);
 if(value)cpaInput.value=value;
}
function validateCpaSearch(){
 const cpaInput=document.getElementById('cpaContainerSearch');
 if(!cpaInput)return false;
 if(!clean(cpaInput.value))syncCpaSearchFromForm();
 const value=cleanContainerForCpa(cpaInput.value);
 if(!value){alert('Container No din ba age XML process korun.');return false;}
 cpaInput.value=value;
 return true;
}
function render(fields){
 const form=document.getElementById('entryForm'),tb=document.querySelector('#summaryTable tbody');
 form.innerHTML='';tb.innerHTML='';
 fields.forEach(f=>{
  const div=document.createElement('div');div.className='field '+(f.type==='textarea'?'full':'');div.dataset.no=f.no;
  const lab=document.createElement('label');lab.innerHTML=`<span class="num">${f.no}</span>${f.label}`;
  let inp=f.type==='textarea'?document.createElement('textarea'):document.createElement('input');
  if(inp.tagName==='INPUT'){
   inp.type='text';
   if(f.type==='date'){
    inp.placeholder='dd/mm/yyyy';inp.inputMode='numeric';inp.maxLength=10;inp.pattern='\\d{2}/\\d{2}/\\d{4}';
    inp.addEventListener('focus',()=>openDatePicker(inp));
    inp.addEventListener('click',()=>openDatePicker(inp));
    inp.addEventListener('change',()=>closeDatePicker(inp));
    inp.addEventListener('blur',()=>closeDatePicker(inp));
   }
  }
  inp.value=f.type==='date'?formatDateDDMMYYYY(f.value||''):(f.value||'');inp.dataset.path=f.path;
  if(f.type==='readonly')inp.readOnly=true;
  div.append(lab,inp);form.appendChild(div);
  tb.insertAdjacentHTML('beforeend',`<tr><td>${f.no}</td><td>${f.label}</td><td>${esc(f.value||'')}</td><td>${esc(f.path)}</td></tr>`)
 });
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function formatDateDDMMYYYY(value){
 const v=clean(value);
 if(!v)return'';
 let m=v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
 if(m)return `${m[3].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[1]}`;
 m=v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
 if(m)return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3]}`;
 return v;
}
function normalizeDateField(el){el.value=formatDateDDMMYYYY(el.value)}
function isoFromDisplayDate(value){
 const v=clean(value);let m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 if(m)return `${m[3]}-${m[2]}-${m[1]}`;
 m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 return m?v:'';
}
function openDatePicker(el){
 if(el.type==='date')return;
 const iso=isoFromDisplayDate(el.value);el.type='date';if(iso)el.value=iso;
 if(el.showPicker)try{el.showPicker()}catch(e){}
}
function closeDatePicker(el){
 const v=el.value;el.type='text';el.placeholder='dd/mm/yyyy';el.value=formatDateDDMMYYYY(v);
}
function getMissingImportantFields(){
 const top=getTopFields();
 const miss=[];
 if(!clean(top.notiNo))miss.push('Noti No');
 if(!clean(top.notiDate))miss.push('Date');
 if(!clean(getVal('REGISTRATION NUMBER')))miss.push('Registration Number');
 if(!clean(getVal('REGISTRATION DATE')))miss.push('Registration Date');
 return miss;
}
function parseAndFill(text){try{const doc=new DOMParser().parseFromString(text,'text/xml');if(doc.querySelector('parsererror'))throw Error('Invalid XML');lastParsedExtras={shippingAgent:shippingAgentValue(doc)};let c={value:'',path:'AUTO:ContainerNumber'};const itemRows=extractItemRows(doc);const filled=FIELDS.map(f=>{let v='',p=f.path;if(f.path==='AUTO:BillOfEntry')v=(xmlValue(doc,'Identification/Type/Type_of_declaration')+' '+xmlValue(doc,'Identification/Type/Declaration_gen_procedure_code')).trim();else if(f.path==='AUTO:ContainerNumber'){c=findContainerNumber(doc);v=c.value;p=c.path}else if(f.path==='AUTO:InvoiceNumberDate'){v=invoiceNumberDateValue(doc)}else if(f.path==='AUTO:TotalInvoiceValue'){v=xmlValue(doc,'Valuation/Total/Total_invoice')}else if(f.path==='AUTO:ItemNo'||['38','34','49','48','39'].includes(f.no)){v=itemFieldValue(itemRows,f.no)}else if(f.path==='AUTO:ConsigneeCombined'){const code=xmlValue(doc,'Traders/Consignee/Consignee_code');const name=xmlValue(doc,'Traders/Consignee/Consignee_name');v=[name,code].filter(Boolean).join(' - ')}else if(f.path==='AUTO:DeclarantCombined'){const code=xmlValue(doc,'Declarant/Declarant_code');const name=xmlValue(doc,'Declarant/Declarant_name');v=[name,code].filter(Boolean).join(' - ')}else v=xmlValue(doc,f.path);return{...f,value:v,path:p}});render(filled);renderItemTable(itemRows);renderContainerTable(doc);showStatus(c.value?'Container number found: '+c.value:'XML loaded, but Container Number ei XML file e nei. Weight thakle table e show korbe.')}catch(e){alert('XML read korte problem hocche: '+e.message)}}

function initializeBlankForm(){
 uploadedText='';
 document.getElementById('notiNo').value='';
 document.getElementById('notiDate').value='';
 document.getElementById('groupValue').value='';
 document.getElementById('docPreview').classList.remove('show');
 document.getElementById('docPreview').innerHTML='';
 render(FIELDS.map(f=>({...f,value:''})));
 renderItemTable([]);
 renderContainerTable(null);
 const st=document.getElementById('status');
 st.textContent='';
 st.style.display='none';
}

function openXMLFilePicker(){
 const input=document.getElementById('xmlFile');
 if(input)input.click();
}
function readSelectedXMLFile(){
 const input=document.getElementById('xmlFile');
 const file=input&&input.files?input.files[0]:null;
 if(!file){showStatus('Age XML file upload korun. Process korar age kono previous data thakbe na.');return;} 
 const selected=document.getElementById('selectedFileName');
 if(selected)selected.textContent=file.name;
 showStatus('XML file reading: '+file.name);
 const r=new FileReader();
 r.onload=e=>{uploadedText=e.target.result;parseAndFill(uploadedText)};
 r.onerror=()=>alert('XML file read korte problem hocche. File ta abar select korun.');
 r.readAsText(file);
}
function handleXMLFileSelect(){
 const input=document.getElementById('xmlFile');
 if(input&&input.files&&input.files[0])showStatus('XML selected. Process button click korun.');
}
function processXML(){readSelectedXMLFile()}
function clearForm(){uploadedText='';lastParsedExtras={shippingAgent:''};document.getElementById('xmlFile').value='';const selected=document.getElementById('selectedFileName');if(selected)selected.textContent='';initializeBlankForm();showStatus('All XML data cleared.')}
function toggleDetailData(){document.getElementById('detailDataBox').classList.toggle('show')}
function showStatus(msg){const s=document.getElementById('status');s.textContent=msg;s.style.display='block'}
function downloadHTML(){const blob=new Blob([document.documentElement.outerHTML],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='asycuda_full_form_noti_date.html';a.click();URL.revokeObjectURL(a.href)}

function getTopFields(){return {notiNo:document.getElementById('notiNo')?.value||'',notiDate:formatDateDDMMYYYY(document.getElementById('notiDate')?.value||''),group:document.getElementById('groupValue')?.value||''};}
function getFormRows(){return [...document.querySelectorAll('#entryForm .field')].map(div=>{const no=div.querySelector('.num')?.textContent||'';const label=(div.querySelector('label')?.textContent||'').replace(no,'').trim();const el=div.querySelector('input,textarea');return{no,label,value:el?.value||'',path:el?.dataset.path||''};});}
function getContainerRows(){return [...document.querySelectorAll('#containerTable tbody tr')].map(tr=>{const t=[...tr.children].map(td=>td.textContent.trim());if(t[0]?.startsWith('No Container'))return null;if(t.length>=3)return {sl:t[0],number:t[1],weight:t[2]};return null;}).filter(Boolean);}
function xmlEsc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));}
function getVal(label){const r=getFormRows().find(x=>x.label.toUpperCase()===label.toUpperCase());return r?r.value:'';}
function buildNoteSheetData(){
 const top=getTopFields(), containers=getContainerRows();
 return {
  notiNo:top.notiNo,
  notiDate:top.notiDate,
  group:top.group,
  fields:getFormRows(),
  containers,
  values:{
   billOfEntry:getVal('BILL OF ENTRY / IMPORT'),
   customsOfficeCode:getVal('CUSTOMS OFFICE CODE'),
   customsOffice:getVal('CUSTOMS OFFICE NAME'),
   manifest:getVal('MANIFEST REFERENCE'),
   registrationNumber:getVal('REGISTRATION NUMBER'),
   registrationDate:formatDateDDMMYYYY(getVal('REGISTRATION DATE')),
   exporter:getVal('EXPORTER NAME'),
   consigneeCode:'',
   consignee:getVal('CONSIGNEE CODE & NAME'),
   declarantCode:'',
   declarant:getVal('DECLARANT CODE & NAME'),
   exportCountry:getVal('COUNTRY OF EXPORT NAME')||getVal('COUNTRY OF EXPORT CODE'),
   originCountry:getVal('COUNTRY OF ORIGIN'),
   originCountryName:getVal('COUNTRY OF ORIGIN'),
   transport:getVal('VESSEL / TRANSPORT IDENTITY'),
   deliveryTerm:getVal('DELIVERY TERM'),
   billOfLoading:getVal('BILL OF LOADING'),
   billOfLoadingDate:formatDateDDMMYYYY(getVal('BILL OF LOADING DATE')),
   containerNumber:getVal('CONTAINER NUMBER')||containers.map(r=>r.number).filter(Boolean).join(', '),
   bankName:getVal('BANK NAME'),
   bankReference:getVal('BANK REFERENCE'),
   paymentTerms:getVal('PAYMENT TERMS'),
   invoiceNumberDate:getVal('Invoice number & date'),
   totalPackages:getVal('TOTAL PACKAGES'),
   packageKind:getVal('PACKAGE KIND'),
   hsCode:getVal('HS CODE'),
   commercialDescription:getVal('COMMERCIAL DESCRIPTION'),
   itemPrice:getVal('ITEM PRICE (USD)'),
   grossWeight:getVal('GROSS WEIGHT'),
   netWeight:getVal('NET WEIGHT'),
   totalInvoiceValue:getVal('TOTAL INVOICE VALUE'),
   shippingAgent:lastParsedExtras.shippingAgent||''
  }
 };
}
function openNoteSheet(){
 const miss=getMissingImportantFields();
 if(miss.length){
  if(!confirm('Important fields empty ('+miss.join(', ')+'). Note Sheet open korben?'))return;
 }
 localStorage.setItem('asycudaNoteSheetData',JSON.stringify(buildNoteSheetData()));
 window.location.href='note_sheet.html';
 showStatus('Note Sheet linked with current form values.');
}
function buildReportHTML(){
 const rows=getFormRows(); const containers=getContainerRows(); const top=getTopFields();
 const now=new Date().toLocaleString();
 return `<div class="docHead"><div><div class="docTitle">BILL OF ENTRY / IMPORT REPORT</div><div class="small">Generated from ASYCUDA XML â€¢ ${esc(now)}</div></div><div><span class="badge">Professional Export</span></div></div>
 <table><tr><th>Noti No</th><td>${esc(top.notiNo)}</td><th>Date</th><td>${esc(top.notiDate)}</td></tr></table><div class="twoCol"><table><tr><th colspan="2">Declaration Summary</th></tr><tr><td>Bill of Entry</td><td>${esc(getVal('BILL OF ENTRY / IMPORT'))}</td></tr><tr><td>Manifest</td><td>${esc(getVal('MANIFEST REFERENCE'))}</td></tr><tr><td>Registration Number</td><td>${esc(getVal('REGISTRATION NUMBER'))}</td></tr><tr><td>Registration Date</td><td>${esc(getVal('REGISTRATION DATE'))}</td></tr><tr><td>Office</td><td>${esc(getVal('CUSTOMS OFFICE NAME'))}</td></tr></table>
 <table><tr><th colspan="2">Commercial Summary</th></tr><tr><td>Exporter</td><td>${esc(getVal('EXPORTER NAME'))}</td></tr><tr><td>Consignee</td><td>${esc(getVal('CONSIGNEE NAME'))}</td></tr><tr><td>HS Code</td><td>${esc(getVal('HS CODE'))}</td></tr><tr><td>Item Price</td><td>${esc(getVal('ITEM PRICE (USD)'))}</td></tr><tr><td>Currency Rate</td><td>${esc(getVal('CURRENCY RATE'))}</td></tr></table></div>
 <h3>Container Details</h3><table><thead><tr><th>SL</th><th>Container Number</th><th>Container Weight</th></tr></thead><tbody>${containers.length?containers.map(r=>`<tr><td>${esc(r.sl)}</td><td>${esc(r.number)}</td><td>${esc(r.weight)}</td></tr>`).join(''):'<tr><td colspan="3">No Container Data Found</td></tr>'}</tbody></table>
 <h3>Detail Data</h3><table><thead><tr><th>No</th><th>Field</th><th>Value</th><th>XML Path</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.no)}</td><td>${esc(r.label)}</td><td>${esc(r.value)}</td><td>${esc(r.path)}</td></tr>`).join('')}</tbody></table>`;
}
function togglePreview(){const p=document.getElementById('docPreview');p.innerHTML=buildReportHTML();p.classList.toggle('show');}
function wordTableRows(rows){return rows.map(r=>`<w:tr><w:tc><w:p><w:r><w:t>${xmlEsc(r[0])}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${xmlEsc(r[1])}</w:t></w:r></w:p></w:tc></w:tr>`).join('')}
function wordDetailRows(rows){return rows.map(r=>`<w:tr><w:tc><w:p><w:r><w:t>${xmlEsc(r.no)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${xmlEsc(r.label)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${xmlEsc(r.value)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${xmlEsc(r.path)}</w:t></w:r></w:p></w:tc></w:tr>`).join('')}
function buildDocumentXml(){
 const rows=getFormRows(); const containers=getContainerRows(); const top=getTopFields(); const now=new Date().toLocaleString();
 const summary=[['Noti No',top.notiNo],['Date',top.notiDate],['Bill of Entry',getVal('BILL OF ENTRY / IMPORT')],['Manifest Reference',getVal('MANIFEST REFERENCE')],['Registration Number',getVal('REGISTRATION NUMBER')],['Registration Date',getVal('REGISTRATION DATE')],['Customs Office',getVal('CUSTOMS OFFICE NAME')],['Exporter',getVal('EXPORTER NAME')],['Consignee',getVal('CONSIGNEE NAME')],['HS Code',getVal('HS CODE')],['Bill of Loading',getVal('BILL OF LOADING')],['Bill of Loading Date',getVal('BILL OF LOADING DATE')],['Item Price (USD)',getVal('ITEM PRICE (USD)')],['Gross Weight',getVal('GROSS WEIGHT')]];
 const contRows=containers.length?containers.map(r=>`<w:tr><w:tc><w:p><w:r><w:t>${xmlEsc(r.sl)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${xmlEsc(r.number)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${xmlEsc(r.weight)}</w:t></w:r></w:p></w:tc></w:tr>`).join(''):`<w:tr><w:tc><w:p><w:r><w:t>No Container Data Found</w:t></w:r></w:p></w:tc><w:tc><w:p/><w:tcPr/></w:tc><w:tc><w:p/><w:tcPr/></w:tc></w:tr>`;
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
 <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="14532D"/></w:rPr><w:t>BILL OF ENTRY / IMPORT REPORT</w:t></w:r></w:p>
 <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Generated from ASYCUDA XML - ${xmlEsc(now)}</w:t></w:r></w:p>
 <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Declaration Summary</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/><w:insideH w:val="single" w:sz="6"/><w:insideV w:val="single" w:sz="6"/></w:tblBorders></w:tblPr>${wordTableRows(summary)}</w:tbl>
 <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Container Details</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/><w:insideH w:val="single" w:sz="6"/><w:insideV w:val="single" w:sz="6"/></w:tblBorders></w:tblPr><w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>SL</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Container Number</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Container Weight</w:t></w:r></w:p></w:tc></w:tr>${contRows}</w:tbl>
 <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Detail Data</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>No</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Field</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Value</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>XML Path</w:t></w:r></w:p></w:tc></w:tr>${wordDetailRows(rows)}</w:tbl>
 <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
}
function crc32(str){let table=crc32.table||(crc32.table=(()=>{let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=((c&1)?(0xEDB88320^(c>>>1)):(c>>>1));t[n]=c>>>0;}return t;})());let crc=0^(-1);const data=new TextEncoder().encode(str);for(let i=0;i<data.length;i++)crc=(crc>>>8)^table[(crc^data[i])&0xFF];return (crc^(-1))>>>0;}
function u16(n){return String.fromCharCode(n&255,(n>>>8)&255)} function u32(n){return String.fromCharCode(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255)}
function zipStore(files){let local='',central='',offset=0;for(const f of files){const data=f.data;const name=f.name;const crc=crc32(data);const size=new TextEncoder().encode(data).length;const nameBytes=new TextEncoder().encode(name);let nameBin='';nameBytes.forEach(b=>nameBin+=String.fromCharCode(b));const dataBytes=new TextEncoder().encode(data);let dataBin='';dataBytes.forEach(b=>dataBin+=String.fromCharCode(b));const lh='PK\x03\x04'+u16(20)+u16(0)+u16(0)+u16(0)+u16(0)+u32(crc)+u32(size)+u32(size)+u16(nameBytes.length)+u16(0)+nameBin+dataBin;local+=lh;central+='PK\x01\x02'+u16(20)+u16(20)+u16(0)+u16(0)+u16(0)+u16(0)+u32(crc)+u32(size)+u32(size)+u16(nameBytes.length)+u16(0)+u16(0)+u16(0)+u16(0)+u32(0)+u32(offset)+nameBin;offset+=lh.length;}return local+central+'PK\x05\x06'+u16(0)+u16(0)+u16(files.length)+u16(files.length)+u32(central.length)+u32(local.length)+u16(0);}
function crc32Bytes(bytes){
 let c=~0;
 for(let i=0;i<bytes.length;i++){
   c^=bytes[i];
   for(let k=0;k<8;k++) c=(c>>>1) ^ (0xEDB88320 & -(c&1));
 }
 return (~c)>>>0;
}
function u16(n){const a=new Uint8Array(2); new DataView(a.buffer).setUint16(0,n,true); return a;}
function u32(n){const a=new Uint8Array(4); new DataView(a.buffer).setUint32(0,n>>>0,true); return a;}
function concatBytes(parts){let len=0;parts.forEach(p=>len+=p.length);const out=new Uint8Array(len);let off=0;parts.forEach(p=>{out.set(p,off);off+=p.length});return out;}
function textBytes(s){return new TextEncoder().encode(s);}
function makeZip(files){
 const locals=[], centrals=[]; let offset=0;
 files.forEach(f=>{
   const name=textBytes(f.name), data=textBytes(f.content), crc=crc32Bytes(data);
   const local=concatBytes([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
   locals.push(local);
   const central=concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
   centrals.push(central); offset+=local.length;
 });
 const centralStart=offset, centralBlob=concatBytes(centrals), localBlob=concatBytes(locals);
 const end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBlob.length),u32(centralStart),u16(0)]);
 return new Blob([localBlob,centralBlob,end],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
function createDocxBlob(documentXml){
 const files=[
  {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'},
  {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
  {name:'word/_rels/document.xml.rels',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'},
  {name:'word/styles.xml',content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>'},
  {name:'word/document.xml',content:documentXml}
 ];
 return makeZip(files);
}

function downloadWord(){
 try{
  const blob=createDocxBlob(buildDocumentXml());
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='ASYCUDA_BOE_Report.docx';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);
  showStatus('Proper DOCX downloaded. CSV na â€” direct Microsoft Word file.');
 }catch(e){
  alert('Word DOCX banate problem hocche: '+e.message);
 }
}

function downloadCSV(){const rows=getFormRows();let csv='No,Field,Value,XML Path\n'+rows.map(r=>[r.no,r.label,r.value,r.path].map(x=>'"'+String(x||'').replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ASYCUDA_Detail_Data.csv';a.click();URL.revokeObjectURL(a.href);}

initializeBlankForm();
loadIcdCredentials();
















