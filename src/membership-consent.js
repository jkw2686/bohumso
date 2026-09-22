export function bindMembershipConsent(form) {
 const all=form.querySelector('#membershipAll');
 const items=['age','terms','privacy','marketing'].map(name=>form.elements.namedItem(name));
 const sync=()=>{const n=items.filter(x=>x.checked).length;all.checked=n===items.length;all.indeterminate=n>0&&n<items.length;};
 all.addEventListener('change',()=>{items.forEach(x=>{x.checked=all.checked;});sync();});
 items.forEach(x=>x.addEventListener('change',sync));
 form.addEventListener('reset',()=>queueMicrotask(sync));sync();
}
