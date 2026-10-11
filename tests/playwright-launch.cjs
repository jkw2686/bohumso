// 브라우저 테스트 공통 실행 옵션.
// 기본은 기존과 동일한 msedge 이므로 개발자 PC 동작은 바뀌지 않는다.
// Edge 가 없는 컨테이너·CI 에서는 아래 두 환경변수로 다른 Chromium 을 쓴다.
//   PLAYWRIGHT_CHANNEL=''                       → channel 을 넘기지 않음
//   PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chrome  → 실행 파일 직접 지정
// .cjs 로 둬서 .mjs 테스트는 default import, .cjs 테스트는 require 로 같은 값을 쓴다.
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'msedge';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
module.exports = {headless: true, ...(channel ? {channel} : {}), ...(executablePath ? {executablePath} : {})};
