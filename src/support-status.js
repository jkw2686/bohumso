// 문의·개인정보 요청의 상태·유형 표시는 화면 어디서든 같은 한글을 쓴다.
// 영문 상태(RECEIVED 등)가 화면에 그대로 나오지 않게 하는 것이 목적이다.
// 상태 값은 supabase/030(기본 RECEIVED)·036(respond 는 IN_PROGRESS/COMPLETED/DECLINED)에 묶여 있다.
export const REQUEST_STATUS=Object.freeze({RECEIVED:'접수',IN_PROGRESS:'처리 중',COMPLETED:'완료',DECLINED:'처리 불가'});
// The conversation view uses its existing longer labels from the same status source.
export const CONVERSATION_STATUS=Object.freeze({RECEIVED:'운영자 확인 대기',IN_PROGRESS:'대화 진행 중',COMPLETED:'처리 완료',DECLINED:'처리 사유 안내'});
export const REQUEST_KIND=Object.freeze({INQUIRY:'문의',ACCESS:'열람',CORRECT:'정정',DELETE:'삭제',REPORT:'신고',WITHDRAW:'탈퇴'});
// 미처리 = 아직 운영자가 답하지 않은 것. 배지·건수에 쓴다.
export const OPEN_STATUSES=Object.freeze(['RECEIVED','IN_PROGRESS']);
export const statusLabel=value=>REQUEST_STATUS[value]||'확인 중';
export const kindLabel=value=>REQUEST_KIND[value]||'문의';
export const isOpen=value=>OPEN_STATUSES.includes(value);
