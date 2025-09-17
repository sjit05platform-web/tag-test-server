// ===== auth.js =====
(function(){
  // 0) 화면 깜빡임 방지
  (function addStyle(){
    const s = document.createElement('style');
    s.textContent = 'html.auth-check{visibility:hidden}';
    document.head.appendChild(s);
    document.documentElement.classList.add('auth-check');
  })();

  // 1) 설정
  const POOL = window.__POOL__;
  const LOGIN = window.__LOGIN_PAGE__ || 'login.html';
  if (!POOL || !POOL.UserPoolId || !POOL.ClientId) {
    console.error('[auth] window.__POOL__ 설정이 없습니다.');
    return;
  }

  let _session = null;
  let _readyResolve;
  const READY = new Promise(res => (_readyResolve = res));

  function goLogin(){
    const u = new URL(LOGIN, location.href);
    u.searchParams.set('redirect', location.href);
    location.replace(u.toString());
  }

  function ensure(){
    if (!window.AmazonCognitoIdentity) {
      // 라이브러리 로드 대기
      return setTimeout(ensure, 20);
    }
    try{
      const pool = new AmazonCognitoIdentity.CognitoUserPool(POOL);
      const user = pool.getCurrentUser();
      if (!user) { goLogin(); return; }
      user.getSession((err, session)=>{
        if (err || !session || !session.isValid()) { goLogin(); return; }
        _session = session;
        document.documentElement.classList.remove('auth-check'); // 통과 → 화면 보이기
        _readyResolve(session);
      });
    }catch(e){
      goLogin();
    }
  }

  // 2) 전역 헬퍼
  window.auth = {
    // 보호 페이지에서: await auth.require();
    require: () => READY,

    idToken(){ return _session?.getIdToken?.().getJwtToken?.() || null; },
    accessToken(){ return _session?.getAccessToken?.().getJwtToken?.() || null; },

    // 선택: REST 호출에 토큰 자동 첨부
    authFetch(input, init={}){
      const headers = new Headers(init.headers || {});
      const idt = this.idToken();
      if (idt) headers.set('Authorization', idt); // User Pool Authorizer면 보통 id_token
      return fetch(input, {...init, headers});
    },

    // 선택: WS URL에 토큰 추가
    wsUrlWithToken(url){
      try{
        const u = new URL(url);
        const t = this.idToken();
        if (t) u.searchParams.set('token', t);
        return u.toString();
      }catch{ return url; }
    },

    signOut(){
      try{
        const pool = new AmazonCognitoIdentity.CognitoUserPool(POOL);
        const user = pool.getCurrentUser();
        if (user) user.signOut();
      } finally {
        goLogin();
      }
    }
  };

  // 3) 시작
  ensure();
})();



// // === Cognito 설정 ===
// const COGNITO = {
//   region: "ap-northeast-2", // 예: ap-northeast-2 (서울)
//   userPoolId: "ap-northeast-2_jubP19tft", // 예: ap-northeast-2_abc123
//   clientId: "2mpr21p7900br0n3p03g8f9ota", // 앱 클라이언트 ID
//   // 로그인 성공 후 돌아갈 페이지(대시보드)
//   redirectAfterLogin: "/design.html",
//   // 인증 없을 때 이동할 페이지(로그인)
//   loginPage: "/login.html",
// };

// // === Cognito UserPool 인스턴스 생성 ===
// const _PoolData = new AmazonCognitoIdentity.CognitoUserPool({
//   UserPoolId: COGNITO.userPoolId,
//   ClientId: COGNITO.clientId,
// });

// // === 내부 상태 ===

// // 세션 얻기 (Promise 반환)
// function getSessionAsync() {
//   return new Promise((resolve, reject) => {
//     const user = _PoolData.getCurrentUser();
//     if (!user) return reject(new Error("NO_USER"));

//     user.getSession((err, session) => {
//       if (err || !session || !session.isValid()) {
//         return reject(err || new Error("INVALID_SESSION"));
//       }
//       resolve({ user, session });
//     });
//   });
// }

// // ID 토큰 문자열 얻기
// async function getIdToken() {
//   const { session } = await getSessionAsync();
//   return session.getIdToken().getJwtToken();
// }

// // 인증 가드: 인증 없으면 로그인 페이지로 리디렉션
// async function requireAuth() {
//   try {
//     await getSessionAsync();
//     return true;
//   } catch {
//     const here = encodeURIComponent(location.pathname + location.search);
//     location.replace(`${COGNITO.loginPage}?next=${here}`);
//     return false;
//   }
// }

// // === 로그인 ===
// function signIn({ username, password }) {
//   return new Promise((resolve, reject) => {
//     const authDetails = new AmazonCognitoIdentity.AuthenticationDetails({
//       Username: username,
//       Password: password,
//     });

//     const cognitoUser = new AmazonCognitoIdentity.CognitoUser({
//       Username: username,
//       Pool: _PoolData,
//     });

//     cognitoUser.authenticateUser(authDetails, {
//       onSuccess: (session) => resolve({ cognitoUser, session }),
//       onFailure: (err) => reject(err),
//       newPasswordRequired: (userAttrs) => {
//         // 필요 시 새 비밀번호 요구 플로우 처리
//         reject({ code: "NEW_PASSWORD_REQUIRED", details: userAttrs });
//       },
//     });
//   });
// }

// // === 회원가입 ===
// function signUp({ username, password, email }) {
//   const attrs = [];
//   if (email) {
//     attrs.push(new AmazonCognitoIdentity.CognitoUserAttribute({
//       Name: 'email', 
//       Value: email,
//     }));
//   }

//   return new Promise((resolve, reject) => {
//     _PoolData.signUp(username, password, attrs, null, (err, result) => {
//       if (err) return reject(err);
//       resolve(result); // 이메일 확인(Verification code) 필요할 수 있음
//     });
//   });
// }

// // === 이메일 확인(Verification code) ===
// function confirmSignUp({ username, code }) {
//   return new Promise((resolve, reject) => {
//     const user = new AmazonCognitoIdentity.CognitoUser({
//       Username: username,
//       Pool: _PoolData,
//     });

//     user.confirmRegistration(code, true, (err, res) => {
//       if (err) return reject(err);
//       resolve(res);
//     });
//   });
// }

// // === 비밀번호 재설정 시작 ===
// function forgotPasswordStart({ username }) {
//   return new Promise((resolve, reject) => {
//     const user = new AmazonCognitoIdentity.CognitoUser({
//       Username: username,
//       Pool: _PoolData,
//     });

//     user.forgotPassword({
//       onSuccess: resolve,
//       onFailure: reject,
//       inputVerificationCode: (data) => resolve(data), // 코드 발송됨
//     });
//   });
// }

// // === 비밀번호 재설정 확인 ===
// function forgotPasswordConfirm({ username, code, newPassword }) {
//   return new Promise((resolve, reject) => {
//     const user = new AmazonCognitoIdentity.CognitoUser({
//       Username: username,
//       Pool: _PoolData,
//     });

//     user.confirmPassword(code, newPassword, {
//       onSuccess: resolve,
//       onFailure: reject,
//     });
//   });
// }

// // === 로그아웃 ===
// function signOut() {
//   const user = _PoolData.getCurrentUser();
//   if (user) user.signOut();
//   location.replace(COGNITO.loginPage);
// }

// // === 인증이 필요한 fetch 요청 헬퍼 ===
// async function authFetch(url, options = {}) {
//   const token = await getIdToken();
//   const headers = new Headers(options.headers || {});
//   headers.set('Authorization', token); // API Gateway Cognito Authorizer와 연동 시 사용

//   return fetch(url, { ...options, headers });
// }

// // === 인증된 웹소켓 URL 생성 ===
// async function withAuthWebSocketURL(wsBaseURL) {
//   const token = await getIdToken();
//   const u = new URL(wsBaseURL);
//   u.searchParams.set('token', token);
//   return u.toString();
// }

// // === 전역 공개 ===
// window.Auth = {
//   requireAuth,
//   signIn,
//   signUp,
//   confirmSignUp,
//   forgotPasswordStart,
//   forgotPasswordConfirm,
//   signOut,
//   getIdToken,
//   authFetch,
//   withAuthWebSocketURL,
//   COGNITO,
// };
