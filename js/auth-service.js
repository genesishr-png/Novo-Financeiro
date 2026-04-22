import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export class AuthService {
			constructor(appInstance) {
				this.app = appInstance;
				this.auth = null;
				// [CHAVES REMOVIDAS] - Cole as suas chaves originais aqui
				this.firebaseConfig = {
					apiKey: "AIzaSyCQ865fjOiTRGbogtvI6leNSBF-n2uCwx0",
					authDomain: "pagamento-5b5c1.firebaseapp.com",
					projectId: "pagamento-5b5c1",
					storageBucket: "pagamento-5b5c1.firebasestorage.app",
					messagingSenderId: "748472701350",
					appId: "1:748472701350:web:2b8d65bb261bbd94f17f67"
				};
			}

			initialize() {
				try {
					const firebaseApp = initializeApp(this.firebaseConfig);
					this.auth = getAuth(firebaseApp);
					setLogLevel('error'); // 'error' em produção, 'debug' para testar
					const db = getFirestore(firebaseApp);
					this.app.firebaseService.setDB(db);
					this.setupAuthListener();
				} catch (error) {
					console.error("Erro na inicialização do Firebase:", error);
					document.getElementById('loading-overlay').textContent = "Erro ao conectar.";
				}
			}

			setupAuthListener() {
				onAuthStateChanged(this.auth, (user) => {
					this.app.handleAuthStateChange(user);
				});
			}

			async login(email, password) {
				const authError = document.getElementById('auth-error');
				authError.classList.add('hidden');

				const loginButton = document.getElementById('login-submit-button');
				const buttonText = document.getElementById('login-button-text');
				const buttonIcon = document.getElementById('login-button-icon');

				if (loginButton) loginButton.disabled = true;
				if (buttonText) buttonText.textContent = "A entrar...";
				if (buttonIcon) buttonIcon.className = "fas fa-spinner fa-spin";

				try {
					await signInWithEmailAndPassword(this.auth, email, password);
				} catch (error) {
					const showAuthError = (m) => { authError.textContent = m; authError.classList.remove('hidden'); };
					// [POLIMENTO] 'auth/invalid-credential' é o erro moderno que cobre (user-not-found, wrong-password, etc)
					if (error.code === 'auth/invalid-credential') {
						showAuthError('Email ou senha inválidos.');
					} else {
						showAuthError('Erro ao tentar fazer login.');
						console.error("Erro de login:", error.code, error.message);
					}
				} finally {
					if (loginButton) loginButton.disabled = false;
					if (buttonText) buttonText.textContent = "Entrar no Sistema";
					if (buttonIcon) buttonIcon.className = "fas fa-sign-in-alt";
				}
			}

			async logout() {
				try {
					await signOut(this.auth);
				} catch (error) {
					console.error("Erro ao fazer logout:", error);
					Utils.showToast('Erro ao tentar sair.', 'error');
				}
			}

			async updateUserProfile(displayName) {
				if (!this.auth.currentUser) return false;
				try {
					await updateProfile(this.auth.currentUser, { displayName });
					return true;
				} catch (error) {
					console.error("Erro ao guardar nome:", error);
					Utils.showToast('Erro ao guardar o seu nome.', 'error');
					return false;
				}
			}
		}