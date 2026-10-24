import test from 'node:test';import assert from 'node:assert/strict';import {isExpertMember,roleDestination} from '../src/role-routing.js';
test('server registration, not role intent, selects expert home; pending and consumer separated',()=>{
 const customer={member:true,profession:'planner',roleIntent:'expert'};
 assert.equal(isExpertMember(customer),false);
 for(const m of [{...customer,partner_status:'pending'},{...customer,partner_status:'approved'},{...customer,state:'EXPERT_DRAFT'}]){
 assert.equal(isExpertMember(m),true);
 for(const path of ['/','/map','/map.html?view=experts','/urgent.html','/find','/consult'])assert.equal(roleDestination(m,path),'/partner.html');
 assert.equal(roleDestination(m,'/map?preview=customer',{preview:true}),null);
 assert.equal(roleDestination(m,'/partner.html?screen=settings'),null);
 }
 assert.equal(roleDestination(customer,'/map'),null);
 assert.equal(isExpertMember({member:true,profession:'office',partner_status:'approved'}),false);
 assert.equal(roleDestination({...customer,partner_status:'pending'},'/partner-work'),'/partner.html');
 assert.equal(roleDestination({...customer,partner_status:'approved'},'/requests'),'/partner-work.html');
});
