export function pushFailureMessage(error){
 const code=error?.message;
 if(code==='permission_blocked'||error?.name==='NotAllowedError')return '알림 권한이 허용되지 않았습니다. 브라우저의 사이트 설정에서 알림을 허용해 주세요. 수신 준비 완료가 아닙니다.';
 if(code==='account_changed'||code==='login_required')return '로그인 계정이 변경되었거나 만료되었습니다. 다시 로그인한 뒤 알림을 켜주세요.';
 if(code==='worker_unavailable'||error?.pushStage==='worker')return '브라우저의 알림 처리기를 연결하지 못했습니다. 일반 Chrome·Edge에서 보험소를 직접 열어 다시 시도해 주세요.';
 if(error?.pushStage==='subscription')return '이 브라우저에서 푸시 구독을 만들지 못했습니다. ChatGPT·메신저 안에서 열었다면 외부 Chrome·Edge에서 보험소를 직접 열어 주세요.';
 if(error?.pushStage==='save')return '기기 구독을 서버에 저장하거나 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
 return '설정을 저장하지 못했습니다. 다시 시도해 주세요.';
}
