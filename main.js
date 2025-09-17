// main.js

const poolData = {
    UserPoolId: 'ap-northeast-2_jubP19tft', // 사용자 풀 ID
    ClientId: '2mpr21p7900br0n3p03g8f9ota' // 클라이언트 ID
};

function main() {
    const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
    const cognitoUser = userPool.getCurrentUser(); 

    const currentUserData = {};

    if (cognitoUser != null) {
        cognitoUser.getSession((err, session) => {
            if (err) {
                console.log(err);
                location.href = "login.html";
            } else {
                cognitoUser.getUserAttributes((err, result) => {
                    if (err) {
                        location.href = "login.html";
                    } 

                    for (let i = 0; i < result.length; i++) {
                        currentUserData[result[i].getName()] = result[i].getValue();
                    }

                    document.getElementById("email").value = currentUserData["email"];

                    const signoutButton = document.getElementById("signout");
                    signoutButton.addEventListener("click", event => {
                        cognitoUser.signOut();
                        localStorage.removeItem('isLoggedIn'); // 로그아웃 시 localStorage에서 제거
                        localStorage.removeItem('username');
                        location.reload();
                    });
                    signoutButton.hidden = false;
                });
            }
        });
    } else {
        location.href = "login.html";
    }
}

// signup.html
function SignUp() {
    var username = document.getElementById("email").value;
    var password = document.getElementById("password").value;
    var userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

     // 이메일 속성을 추가합니다.
    var attributeList = [];
    var dataEmail = {
        Name: 'email',
        Value: username
    };
    
    var attributeEmail = new AmazonCognitoIdentity.CognitoUserAttribute(dataEmail);
    attributeList.push(attributeEmail);

    userPool.signUp(username, password, attributeList, null, function(err) {
        if (err) {
            alert(err.message || JSON.stringify(err));
            return;
        }
        window.location.href = 'confirm.html';
    });         
}

// confirm.html
function ConfirmRegistration() {
    var userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
    var username = document.getElementById("email").value;
    var code = document.getElementById("ConfirmCode").value;
    var userData = {
        Username: username,
        Pool: userPool,
    };
    var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.confirmRegistration(code, true, function(err, result) {
        if (err) {
            alert(err.message || JSON.stringify(err));
            return;
        }
        console.log('call result: ' + result);
        window.location.href = 'login.html';      
    });
}

// login.html
function Login() {
    const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
    var username = document.getElementById("email").value;
    var password = document.getElementById("password").value;

    var authenticationData = {
        Username: username,
        Password: password,
    };

    var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(
        authenticationData
    );
    var userData = {
        Username: username,
        Pool: userPool,
    };

    var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: function (result) {
            var idToken = result.getIdToken().getJwtToken();          // ID 토큰
            var accessToken = result.getAccessToken().getJwtToken();  // 액세스 토큰
            var refreshToken = result.getRefreshToken().getToken();   // 갱신 토큰

            console.log("idToken : " + idToken);
            console.log("accessToken : " + accessToken);
            console.log("refreshToken : " + refreshToken);

            localStorage.setItem('isLoggedIn', 'true'); // sessionStorage에서 localStorage로 변경
            localStorage.setItem('username', username);

            sessionStorage.setItem('app_session', '1'); // 이번 탭 세션의 로그인 완료 표시
            const params = new URLSearchParams(location.search);
            const back = params.get('redirect') || 'design.html';
            location.replace(back); // 뒤로가기로 로그인 페이지 안 남도록 replace 권장
        },

        onFailure: function(err) {
            // 로그인에 실패 했을 경우 에러 메시지 표시
            console.log(err);
            alert("로그인 실패")
        }
    });
}