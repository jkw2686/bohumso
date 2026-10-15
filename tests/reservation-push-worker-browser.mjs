import {chromium,expect} from '@playwright/test';import launch from './playwright-launch.cjs';import {readFile} from 'node:fs/promises';
const browser=await chromium.launch(launch),page=await browser.newPage();
await page.route('https://worker.fixture.test/**',r=>r.fulfill({body:'<!doctype html><title>Isolated worker storage test</title>',contentType:'text/html'}));
try{await page.goto('https://worker.fixture.test');const result=await page.evaluate(async source=>{
 const handlers={},shown=[],opened=[],mock={location:{origin:location.origin},addEventListener:(name,fn)=>handlers[name]=fn,clients:{get:async id=>({url:id==='foreign'?'https://foreign.test':location.origin}),openWindow:async url=>opened.push(url)},registration:{getNotifications:async()=>shown.map(n=>({data:n.data,close:()=>n.closed=true})),showNotification:async(title,options)=>shown.push({title,...options})}};
 new Function('self',source)(mock);
 const emit=async(name,event)=>{let work;handlers[name]({...event,waitUntil:p=>work=p});await work;};
 const message=async(data,id='own')=>{let answer;await emit('message',{data,source:{id},ports:[{postMessage:r=>answer=r}]});return answer;};
 const push=async data=>emit('push',{data:{json:()=>data}});
 const id='50000000-0000-4000-8000-000000000001',binding='40000000-0000-4000-8000-000000000001';
 await message({type:'set-binding',binding});await push({id,binding:'foreign',body:'wrong account'});const foreignCount=shown.length;
 await push({id,binding,body:'예약 안내가 있어요.',url:'https://malicious.test'});await push({id,binding,body:'duplicate'});const ownCount=shown.length;
 await emit('notificationclick',{notification:{data:shown[0].data,close(){}}});
 await message({type:'set-binding',binding:null});await emit('notificationclick',{notification:{data:shown[0].data,close(){}}});await push({id:'50000000-0000-4000-8000-000000000002',binding});const afterLogout=shown.length;
 await message({type:'set-binding',binding},'foreign');const final=await message({type:'get-binding'});
 await message({type:'set-binding',binding});let release,started;const begun=new Promise(r=>started=r),gate=new Promise(r=>release=r);mock.registration.showNotification=async(title,options)=>{shown.push({title,...options});started();await gate;};
 const race=push({id:'50000000-0000-4000-8000-000000000003',binding});await begun;const logout=message({type:'set-binding',binding:null});release();await Promise.all([race,logout]);const raceClosed=shown.at(-1).closed===true;
 return {foreignCount,ownCount,afterLogout,opened,shown,final,raceClosed};
},await readFile('public/reservation-push-sw.js','utf8'));
expect(result.foreignCount).toBe(0);expect(result.ownCount).toBe(1);expect(result.afterLogout).toBe(1);expect(result.shown[0].data.url).toBe('/notifications.html');expect(result.opened).toEqual(['https://worker.fixture.test/notifications.html']);expect(result.final.binding).toBe(null);expect(result.raceClosed).toBe(true);console.log('PASS real browser IndexedDB: foreign binding suppressed, duplicate suppressed, safe link, logout suppresses push/click, foreign message denied, concurrent show/logout closes prior notification before ACK. Simulated push events; no physical delivery.');
}finally{await browser.close();}
