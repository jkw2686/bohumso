/** Present existing settings without replacing their controls or handlers. */
export function settingsRow(root,{title,value,action,icon='settings'}){
 const paths={settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',person:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3a8 8 0 0 1 16 0v3',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',phone:'M5 3h4l2 5-3 2a14 14 0 0 0 6 6l2-3 5 2v4c-9 3-21-9-16-16'};
 const row=document.createElement('div');row.className='settings-row';
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[icon]||paths.settings);svg.append(path);
 const info=document.createElement('div');info.className='settings-row-info';info.append(title);if(value)info.append(value);row.append(svg,info);if(action){action.classList.add('settings-row-action');row.append(action);}root.prepend(row);root.classList.add('settings-section');return row;
}
