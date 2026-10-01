import {startTestFlow} from './test-flow.mjs';
await startTestFlow({port:3200,dataDir:'artifacts/social-preview-db'});
console.log('Private social preview: http://127.0.0.1:3200/signup.html');
