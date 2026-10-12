// Open an existing section only when a full-menu link selected it.
export function openMenuDestination() {
  if (new URLSearchParams(location.search).get('from') !== 'menu') return;
  const anchors = {
    'profile-editor': document.querySelector('.optional-profile'),
    'consult-settings': document.querySelector('.consult-settings'),
    'activity-area': [...document.querySelectorAll('.urgent-panel')].find(section => section.querySelector('h2')?.textContent === '주활동지역'),
    'instant-settings': [...document.querySelectorAll('.urgent-panel')].find(section => section.querySelector('h2')?.textContent === '지금 방문 상담 가능'),
    partnerState: document.getElementById('partnerState'),
    workflowFilters: document.getElementById('workflowFilters'),
    workflowSummary: document.getElementById('workflowSummary'),
    growthPractice: document.getElementById('growthPractice'),
    growthLibrary: document.getElementById('growthLibrary'),
  };
  const key = location.hash.slice(1), section = anchors[key];
  if (!section) return;
  const toggle = section.querySelector('.profile-toggle[aria-expanded="false"]');
  toggle?.click();
  const target = section.querySelector('h2') || section;
  target.tabIndex = -1;
  target.focus({preventScroll: true});
  const header = document.querySelector('.nav');
  const fixed = header && ['fixed', 'sticky'].includes(getComputedStyle(header).position);
  const top = section.getBoundingClientRect().top + scrollY - (fixed ? header.offsetHeight : 0) - 16;
  scrollTo({top, behavior: 'instant'});
}
