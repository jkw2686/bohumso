// This is a display gate only. Server/RPC authorization remains mandatory.
export const adminPage = document.body.hasAttribute('data-admin-access');
let revision = 0;
export function lockAdminPage(text = '접근 권한을 확인하고 있습니다.') {
  if (!adminPage) return revision;
  ++revision;
  document.body.dataset.adminAccess = 'checking';
  document.getElementById('adminAccessNotice').textContent = text;
  return revision;
}
export function grantAdminPage(ticket) {
  if (!adminPage) return true;
  if (ticket !== revision) return false;
  document.body.dataset.adminAccess = 'granted';
  return true;
}
export function adminPageCurrent(ticket) { return !adminPage || ticket === revision; }
if (adminPage) {
  window.addEventListener('pagehide', () => lockAdminPage());
  window.addEventListener('pageshow', event => {
    if (event.persisted) { lockAdminPage(); location.reload(); }
  });
}
