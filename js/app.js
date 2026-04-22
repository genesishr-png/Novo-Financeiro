// Imports do Firebase
		import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
		import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
		import { getFirestore, collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, setLogLevel, writeBatch, serverTimestamp, query, where, orderBy, limit, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

		// Constantes Globais
		// [CORREÇÃO LIXEIRA] Nomes em minúsculo para verificação
		const ADMIN_USERS = ["dra. renata fabris", "Darc", "dr. felipe gurjão", "lilian"];
		const CONTRACTS_PER_PAGE = 12; // Itens por página
		// Objeto de Utilitários
		const Utils = {
			toastContainer: null,
			initToast() {
				// [MUDANÇA v5] Usa o div #notifications se existir, se não, cria um.
				let el = document.getElementById('notifications');
				if (!el) {
					el = document.createElement('div');
					el.id = 'toast-container-fallback'; // Nome diferente para evitar conflito
					el.style.position = 'fixed';
					el.style.bottom = '20px';
					el.style.right = '20px';
					el.style.zIndex = '11000';
					el.style.display = 'flex';
					el.style.flexDirection = 'column';
					el.style.gap = '8px';
					document.body.appendChild(el);
				}
				this.toastContainer = el;
			},
			showToast(message, type = 'info') {
				if (!this.toastContainer) {
					this.initToast();
				}
				const n = document.createElement('div');
				n.className = 'px-4 py-3 rounded-lg shadow-lg text-sm';
				n.style.background = type === 'error' ? '#7f1d1d' : (type === 'success' ? '#065f46' : '#374151');
				n.style.color = '#fff';
				n.setAttribute('role', 'alert');
				n.textContent = message;
				this.toastContainer.appendChild(n);
				setTimeout(() => n.remove(), 2500);
			},
			debounce(fn, ms = 300) {
				let t;
				return (...args) => {
					clearTimeout(t);
					t = setTimeout(() => fn(...args), ms);
				};
			},
			sanitizeText(s) {
				if (s == null) return '';
				const str = String(s);
				const div = document.createElement('div');
				div.textContent = str;
				return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;').trim();
			},
			// [NOVO v5.7] Helpers para anexos (Base64)
			fileToBase64(file) {
				return new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.readAsDataURL(file);
					reader.onload = () => resolve(reader.result);
					reader.onerror = error => reject(error);
				});
			},
			validateFileSize(file, maxSizeMB = 0.3) {
				const sizeInMB = file.size / (1024 * 1024);
				return sizeInMB <= maxSizeMB;
			},
			setupDragAndDrop(element, onDrop) {
				if (!element) return;

				['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
					element.addEventListener(eventName, preventDefaults, false);
				});

				function preventDefaults(e) {
					e.preventDefault();
					e.stopPropagation();
				}

				['dragenter', 'dragover'].forEach(eventName => {
					element.addEventListener(eventName, () => element.classList.add('border-indigo-500', 'bg-gray-700'), false);
				});

				['dragleave', 'drop'].forEach(eventName => {
					element.addEventListener(eventName, () => element.classList.remove('border-indigo-500', 'bg-gray-700'), false);
				});

				element.addEventListener('drop', (e) => {
					const dt = e.dataTransfer;
					const files = dt.files;
					if (files && files.length > 0) {
						onDrop(files[0]);
					}
				}, false);
			},
			// [MUDANÇA v5] Helper para "sanitizar" nomes para IDs do Firestore
			sanitizeForFirestoreId(name) {
				if (!name) return 'unknown_user';
				return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
			},
			parseNumber(n) {
				const v = Number(n);
				return Number.isFinite(v) ? v : 0;
			},
			confirm(message) {
				return new Promise((resolve) => {
					let modal = document.getElementById('confirmModal');
					if (!modal) {
						modal = document.createElement('div');
						modal.id = 'confirmModal';
						modal.innerHTML = `
		<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);z-index:12000" role="alertdialog" aria-modal="true" aria-labelledby="confirmMessage">
		<div class="dark-card" style="width:100%;max-width:420px;border-radius:12px;border:1px solid #374151;padding:16px;background:#111827">
		<p id="confirmMessage" class="text-gray-200 mb-4"></p>
		<div class="flex justify-end gap-2">
			<button id="confirmCancel" class="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg">Cancelar</button>
			<button id="confirmOk" class="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg">Confirmar</button>
		</div>
		</div>
		</div>`;
						document.body.appendChild(modal);
					}
					modal.querySelector('#confirmMessage').textContent = message;
					modal.style.display = 'block';
					const onClose = (val) => { modal.style.display = 'none'; resolve(val); };
					modal.querySelector('#confirmCancel').onclick = () => onClose(false);
					modal.querySelector('#confirmOk').onclick = () => onClose(true);
				});
			},
			formatCurrency(value) {
				return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
			},
			formatDate(dateStr) {
				if (!dateStr) return '';
				const date = new Date(dateStr);
				// [MUDANÇA v5] Corrigido para garantir UTC na formatação de datas simples
				const d = date.getUTCDate();
				const m = date.getUTCMonth() + 1;
				const y = date.getUTCFullYear();
				return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
			},
			// [MUDANÇA v5] Novo helper para "tempo atrás"
			timeAgo(dateInput) {
				if (!dateInput) return '';
				const date = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
				const now = new Date();
				const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

				let interval = seconds / 31536000;
				if (interval > 1) return `há ${Math.floor(interval)} ano(s)`;
				interval = seconds / 2592000;
				if (interval > 1) return `há ${Math.floor(interval)} mes(es)`;
				interval = seconds / 86400;
				if (interval > 1) return `há ${Math.floor(interval)} dia(s)`;
				interval = seconds / 3600;
				if (interval > 1) return `há ${Math.floor(interval)} hora(s)`;
				interval = seconds / 60;
				if (interval > 1) return `há ${Math.floor(interval)} min(s)`;
				return `há ${Math.floor(seconds)} seg(s)`;
			}
		};

		/**
		 * @class CorrectionCalculator
		 * [NOVO v5.5] Esta classe foi totalmente refatorada.
		 * Ela não busca mais na internet (removendo o bug 429).
		 * Ela usa uma tabela interna (IPCA_TABLE) para cálculos.
		 * Isso torna o app mais rápido e 100% confiável.
		 */
		class CorrectionCalculator {
			constructor() {
				// Valores do IPCA (em %) - https://www.bcb.gov.br/pec/Indeco/IEP/ipedida.asp?id=433
				// Você deve atualizar esta tabela manualmente a cada novo mês para manter a precisão.
				this.IPCA_TABLE = {
					"2023-01": 0.53, "2023-02": 0.84, "2023-03": 0.71, "2023-04": 0.61,
					"2023-05": 0.23, "2023-06": -0.08, "2023-07": 0.12, "2023-08": 0.23,
					"2023-09": 0.26, "2023-10": 0.24, "2023-11": 0.28, "2023-12": 0.56,
					"2024-01": 0.42, "2024-02": 0.83, "2024-03": 0.16, "2024-04": 0.38,
					"2024-05": 0.46, "2024-06": 0.36, "2024-07": 0.16, "2024-08": 0.24,
					"2024-09": 0.26, "2024-10": 0.42, "2024-11": 0.53, "2024-12": 0.48,
					"2025-01": 0.55, "2025-02": 0.78, "2025-03": 0.21, "2025-04": 0.35,
					"2025-05": 0.40, "2025-06": 0.26, "2025-07": 0.22, "2025-08": 0.31,
					"2025-09": 0.33, "2025-10": 0.40,
					// TODO: Adicionar "2025-11" quando o índice for divulgado
				};
			}

			toUTCDate(y, m, d) { const dt = new Date(Date.UTC(y, m, d)); dt.setUTCHours(0, 0, 0, 0); return dt; }

			diffMonths_30_360(fromDate, toDate) {
				let y1 = fromDate.getUTCFullYear(), m1 = fromDate.getUTCMonth() + 1, d1 = fromDate.getUTCDate();
				let y2 = toDate.getUTCFullYear(), m2 = toDate.getUTCMonth() + 1, d2 = toDate.getUTCDate();
				if (d1 === 31) d1 = 30;
				if (d2 === 31 && d1 === 30) d2 = 30;
				return Math.max(0, (y2 - y1) * 12 + (m2 - m1) + (d2 - d1) / 30);
			}

			getIPCAAccumulatedFactor(vencDate, refDate) {
				let factor = 1.0;
				// Começa no mês de vencimento
				let currentDate = new Date(Date.UTC(vencDate.getUTCFullYear(), vencDate.getUTCMonth(), 1));
				// Para no mês *anterior* ao da data de referência
				const endDate = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1));

				while (currentDate < endDate) {
					const year = currentDate.getUTCFullYear();
					const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
					const key = `${year}-${month}`;

					const ipcaPercent = this.IPCA_TABLE[key];
					if (ipcaPercent !== undefined) {
						factor *= (1 + ipcaPercent / 100);
					} else {
						console.warn(`[IPCA] Índice não encontrado para ${key}. O cálculo pode estar incompleto.`);
					}

					currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
				}
				return factor;
			}

			// A função agora é síncrona (não usa 'async')
			calcularValorCorrigido(valorOriginal, dataVencimento, dataReferencia = new Date()) {
				const ref = this.toUTCDate(dataReferencia.getUTCFullYear(), dataReferencia.getUTCMonth(), dataReferencia.getUTCDate());
				const vRaw = new Date(dataVencimento);
				const venc = this.toUTCDate(vRaw.getUTCFullYear(), vRaw.getUTCMonth(), vRaw.getUTCDate());

				if (ref <= venc) return valorOriginal;

				// 1. Correção (IPCA) da tabela interna
				const ipcaFactor = this.getIPCAAccumulatedFactor(venc, ref);

				// 2. Juros (1% a.m. simples)
				const meses = this.diffMonths_30_360(venc, ref);
				const jurosSimplesFactor = 1 + 0.01 * meses;

				return valorOriginal * ipcaFactor * jurosSimplesFactor;
			}
		}

		/**
		 * @class AuthService
		 */
		class AuthService {
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

		/**
		 * @class FirebaseService
		 */
		class FirebaseService {
			constructor(appInstance) {
				this.app = appInstance;
				this.db = null;
				this.contractsCollection = null;
				this.snapshotListenerUnsubscribe = null;
				// [MUDANÇA v5] Listeners de Notificação
				this.notificationListenerUnsubscribe = null;
				this.notificationCollection = null;
				// [INÍCIO DA ALTERAÇÃO - OFICINA]
				this.settingsListenerUnsubscribe = null;
				// [FIM DA ALTERAÇÃO - OFICINA]
			}

			setDB(dbInstance) {
				this.db = dbInstance;
			}

			startSnapshotListener(collectionName) {
				if (this.snapshotListenerUnsubscribe) {
					this.snapshotListenerUnsubscribe();
				}
				this.contractsCollection = collection(this.db, collectionName);
				this.snapshotListenerUnsubscribe = onSnapshot(this.contractsCollection, (snapshot) => {
					const contracts = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
					this.app.handleSnapshotUpdate(contracts);
				}, (error) => {
					console.error("Erro ao buscar dados (contracts):", error);
					Utils.showToast('Erro de conexão. Não foi possível atualizar os dados.', 'error');
				});
			}

			stopSnapshotListener() {
				if (this.snapshotListenerUnsubscribe) {
					this.snapshotListenerUnsubscribe();
					this.snapshotListenerUnsubscribe = null;
				}
			}

			// [MUDANÇA v5] Lógica de Notificações
			startNotificationListener(safeName) {
				if (this.notificationListenerUnsubscribe) {
					this.notificationListenerUnsubscribe();
				}
				this.notificationCollection = collection(this.db, `notifications/${safeName}/alerts`);
				const q = query(this.notificationCollection, orderBy("timestamp", "desc"), limit(20));

				this.notificationListenerUnsubscribe = onSnapshot(q, (snapshot) => {
					const notifications = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
					this.app.handleNotificationUpdate(notifications);
				}, (error) => {
					// [MUDANÇA v5.4] Silencia o toast de erro daqui, pois já corrigimos as regras
					console.error("Erro ao buscar notificações:", error);
					// Utils.showToast('Erro ao buscar notificações.', 'error');
				});
			}

			stopNotificationListener() {
				if (this.notificationListenerUnsubscribe) {
					this.notificationListenerUnsubscribe();
					this.notificationListenerUnsubscribe = null;
				}
			}

			// [INÍCIO DA ALTERAÇÃO - OFICINA]
			// Nova função para escutar a coleção systemSettings
			startSystemSettingsListener() {
				if (this.settingsListenerUnsubscribe) {
					this.settingsListenerUnsubscribe();
				}

				const settingsCollection = collection(this.db, 'systemSettings');

				this.settingsListenerUnsubscribe = onSnapshot(settingsCollection, (snapshot) => {
					const settings = {};
					snapshot.docs.forEach(docSnap => {
						settings[docSnap.id] = docSnap.data();
					});
					this.app.handleSystemSettingsUpdate(settings);
				}, (error) => {
					console.error("Erro ao buscar systemSettings:", error);
					Utils.showToast('Erro ao buscar configurações do sistema.', 'error');
				});
			}

			stopSystemSettingsListener() {
				if (this.settingsListenerUnsubscribe) {
					this.settingsListenerUnsubscribe();
					this.settingsListenerUnsubscribe = null;
				}
			}

			// Nova função para salvar um documento específico em systemSettings
			async saveSystemSettings(docId, data) {
				try {
					// Usamos 'setDoc' com 'merge: true' para criar ou atualizar o documento
					// sem sobrescrever outros campos, caso existam.
					const docRef = doc(this.db, 'systemSettings', docId);
					await setDoc(docRef, data, { merge: true });
					Utils.showToast('Configurações salvas com sucesso.', 'success');
					return true;
				} catch (error) {
					console.error(`Erro ao salvar ${docId}:`, error);
					Utils.showToast('Erro ao salvar configurações. Verifique suas permissões.', 'error');
					return false;
				}
			}
			// [FIM DA ALTERAÇÃO - OFICINA]


			async sendNotification(safeRecipientName, notificationData) {
				try {
					const targetCollection = collection(this.db, `notifications/${safeRecipientName}/alerts`);
					await addDoc(targetCollection, {
						...notificationData,
						isRead: false,
						timestamp: serverTimestamp()
					});
					return true;
				} catch (error) {
					console.error(`Erro ao enviar notificação para ${safeRecipientName}:`, error);
					return false;
				}
			}

			async markNotificationsAsRead(safeUserName, notificationIds) {
				try {
					const batch = writeBatch(this.db);
					notificationIds.forEach(id => {
						const docRef = doc(this.db, `notifications/${safeUserName}/alerts`, id);
						batch.update(docRef, { isRead: true });
					});
					await batch.commit();
				} catch (error) {
					console.error("Erro ao marcar notificações como lidas:", error);
					Utils.showToast('Erro ao atualizar notificações.', 'error');
				}
			}
			// [FIM MUDANÇA v5]

			async addContract(contractData) {
				try {
					await addDoc(this.contractsCollection, contractData);
					Utils.showToast('Contrato guardado com sucesso.', 'success');
					return true;
				} catch (error) {
					console.error("Erro ao adicionar contrato:", error);
					Utils.showToast('Erro ao guardar o contrato. Tente novamente.', 'error');
					return false;
				}
			}

			async updateContract(contractId, contractData) {
				try {
					const contractRef = doc(this.contractsCollection, contractId);
					await updateDoc(contractRef, contractData);
					Utils.showToast('Contrato atualizado.', 'success');
					return true;
				} catch (error) {
					console.error("Erro ao atualizar contrato:", error);
					Utils.showToast('Erro ao atualizar o contrato. Tente novamente.', 'error');
					return false;
				}
			}

			async updateContractField(contractId, fieldData) {
				try {
					const contractRef = doc(this.contractsCollection, contractId);
					await updateDoc(contractRef, fieldData);
					return true;
				} catch (error) {
					console.error(`Erro ao atualizar campo do contrato (${contractId}):`, error);
					Utils.showToast('Erro ao atualizar o item. Tente novamente.', 'error');
					return false;
				}
			}

			async deleteContract(contractId) {
				try {
					await deleteDoc(doc(this.contractsCollection, contractId));
					Utils.showToast('Contrato excluído permanentemente.', 'success');
					return true;
				} catch (error) {
					console.error("Erro ao excluir contrato:", error);
					Utils.showToast('Erro ao excluir o contrato. Tente novamente.', 'error');
					return false;
				}
			}
		}

		/**
		 * @class AnalyticsHandler
		 */
		class AnalyticsHandler {
			constructor() {
				this.actualIncomeChartInstance = null;
				this.projectedIncomeChartInstance = null;
				// [MUDANÇA v5] Gráficos do Relatório Avançado
				this.advReportTimelineChart = null;
				this.advReportByAdvogadoChart = null;
				this.advReportNewContractsChart = null;
				// [NOVO v5.5] Gráficos da Página de Performance
				this.adminChartContratos = null;
				this.adminChartFaturamento = null;
			}

			getChartConfig(type, labels, datasets) {
				const isHorizontal = type.startsWith('horizontal');
				const axis = isHorizontal ? 'x' : 'y';
				const indexAxis = isHorizontal ? 'y' : 'x';

				return {
					type: type.replace('horizontal', ''),
					data: { labels, datasets },
					options: {
						indexAxis: indexAxis,
						responsive: true,
						maintainAspectRatio: false,
						scales: {
							[axis]: { beginAtZero: true, ticks: { color: '#9ca3af' } },
							[indexAxis]: { ticks: { color: '#9ca3af' } }
						},
						plugins: {
							legend: { labels: { color: '#d1d5db' } }
						}
					}
				};
			}

			// Gráficos do Modal Legado
			renderActualIncomeChart(ctx, labels, data) {
				if (this.actualIncomeChartInstance) this.actualIncomeChartInstance.destroy();
				this.actualIncomeChartInstance = new Chart(ctx, this.getChartConfig(
					'bar', labels, [{ label: 'Faturação Real', data, backgroundColor: 'rgba(74, 222, 128, 0.6)', borderColor: 'rgba(74, 222, 128, 1)', borderWidth: 1 }]
				));
			}

			renderProjectedIncomeChart(ctx, labels, data) {
				if (this.projectedIncomeChartInstance) this.projectedIncomeChartInstance.destroy();
				this.projectedIncomeChartInstance = new Chart(ctx, this.getChartConfig(
					'bar', labels, [{ label: 'Projeção (Parcelas)', data, backgroundColor: 'rgba(139, 92, 246, 0.6)', borderColor: 'rgba(139, 92, 246, 1)', borderWidth: 1 }]
				));
			}

			// [MUDANÇA v5] Novos Gráficos do Relatório Avançado
			renderTimelineChart(ctx, labels, data) {
				if (this.advReportTimelineChart) this.advReportTimelineChart.destroy();
				this.advReportTimelineChart = new Chart(ctx, this.getChartConfig(
					'line', labels, [{ label: 'Faturação', data, backgroundColor: 'rgba(74, 222, 128, 0.2)', borderColor: 'rgba(74, 222, 128, 1)', borderWidth: 2, fill: true, tension: 0.1 }]
				));
			}

			renderByAdvogadoChart(ctx, labels, data) {
				if (this.advReportByAdvogadoChart) this.advReportByAdvogadoChart.destroy();
				this.advReportByAdvogadoChart = new Chart(ctx, this.getChartConfig(
					'pie', labels, [{
						label: 'Faturação', data,
						backgroundColor: ['#4f46e5', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#0ea5e9', '#22c55e', '#eab308', '#dc2626'],
						borderWidth: 0
					}]
				));
			}

			renderNewContractsChart(ctx, labels, data) {
				if (this.advReportNewContractsChart) this.advReportNewContractsChart.destroy();
				this.advReportNewContractsChart = new Chart(ctx, this.getChartConfig(
					'bar', labels, [{ label: 'Novos Contratos', data, backgroundColor: 'rgba(139, 92, 246, 0.6)', borderColor: 'rgba(139, 92, 246, 1)', borderWidth: 1 }]
				));
			}

			// [NOVO v5.5] Gráficos da Página de Performance
			renderAdminContratosChart(ctx, labels, data) {
				if (this.adminChartContratos) this.adminChartContratos.destroy();
				this.adminChartContratos = new Chart(ctx, this.getChartConfig(
					'pie', labels, [{
						label: 'Contratos Ativos', data,
						backgroundColor: ['#4f46e5', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#0ea5e9', '#22c55e', '#eab308', '#dc2626'],
						borderWidth: 0
					}]
				));
			}

			renderAdminFaturamentoChart(ctx, labels, data) {
				if (this.adminChartFaturamento) this.adminChartFaturamento.destroy();
				this.adminChartFaturamento = new Chart(ctx, this.getChartConfig(
					'bar', labels, [{ label: 'Faturação (Ano)', data, backgroundColor: 'rgba(74, 222, 128, 0.6)', borderColor: 'rgba(74, 222, 128, 1)', borderWidth: 1 }]
				));
			}

			// [CORREÇÃO v5.2] Força a remoção de tooltips "fantasmas"
			_forceRemoveTooltips() {
				const tooltips = document.querySelectorAll('div.chartjs-tooltip');
				tooltips.forEach(tip => tip.remove());
			}

			// [CORREÇÃO v5.2] Destruição separada para Gráficos da PÁGINA
			destroyPageCharts(pageId) {
				if (pageId === 'page-relatorios') {
					if (this.advReportTimelineChart) this.advReportTimelineChart.destroy();
					if (this.advReportByAdvogadoChart) this.advReportByAdvogadoChart.destroy();
					if (this.advReportNewContractsChart) this.advReportNewContractsChart.destroy();
					this.advReportTimelineChart = null;
					this.advReportByAdvogadoChart = null;
					this.advReportNewContractsChart = null;
				}

				if (pageId === 'page-performance') {
					if (this.adminChartContratos) this.adminChartContratos.destroy();
					if (this.adminChartFaturamento) this.adminChartFaturamento.destroy();
					this.adminChartContratos = null;
					this.adminChartFaturamento = null;
				}

				if (pageId === 'page-oficina') {
					// Lógica de destruição de gráficos da Oficina (se houver)
				}

				this._forceRemoveTooltips();
			}

			// [CORREÇÃO v5.2] Destruição separada para Gráficos do MODAL
			destroyModalCharts() {
				if (this.actualIncomeChartInstance) this.actualIncomeChartInstance.destroy();
				if (this.projectedIncomeChartInstance) this.projectedIncomeChartInstance.destroy();

				this.actualIncomeChartInstance = null;
				this.projectedIncomeChartInstance = null;

				this._forceRemoveTooltips();
			}
		}

		/**
		 * @class ReportHandler
		 */
		class ReportHandler {
			constructor(appInstance) {
				this.app = appInstance;
			}

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Removida a verificação 'isUserAdmin', pois os 'contractsToRender'
			// já vêm pré-filtrados pela classe App.
			calculateIncomeByDateRange(startDate, endDate, contractsToRender) {
				let totalParcelas = 0, totalExito = 0, totalVencido = 0;
				const detailedPayments = [];
				const byAdvogado = {};
				const byMonth = {};
				const vencidoByMonth = {};
				const newContractsByMonth = {};

				// Filtra contratos excluídos
				const allContracts = contractsToRender.filter(c => !c.isDeleted);

				const addData = (map, date, value) => {
					// Cria chave de mês (Ex: "2025-11")
					const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
					map[monthKey] = (map[monthKey] || 0) + value;
				};

				allContracts.forEach(contract => {
					const advogado = contract.advogadoResponsavel || 'Não Informado';

					// 1. Novos Contratos (Baseado na Data de Criação)
					if (contract.createdAt) {
						const d = new Date(contract.createdAt);
						if (d >= startDate && d <= endDate) addData(newContractsByMonth, d, 1);
					}

					// 2. Parcelas
					(contract.parcels || []).forEach(parcel => {
						// === RECEBIDO (O que entrou no caixa) ===
						if (parcel.status === 'Paga' && parcel.paymentDate) {
							const d = new Date(parcel.paymentDate);
							// Verifica se o PAGAMENTO foi dentro do mês
							if (d >= startDate && d <= endDate) {
								const value = parcel.valuePaid;
								totalParcelas += value;
								detailedPayments.push({ type: `Parcela ${parcel.number}/${contract.parcels.length}`, clientName: contract.clientName, date: d, value: value, advogado: advogado });
								byAdvogado[advogado] = (byAdvogado[advogado] || 0) + value;
								addData(byMonth, d, value);
							}
						}
						// === DÍVIDA / INADIMPLÊNCIA (O que devia ter entrado) ===
						else if (parcel.status === 'Pendente') {
							const d = new Date(parcel.dueDate);

							// AQUI ESTÁ O SEGREDO:
							// 1. A data de vencimento (d) tem que ser MAIOR ou IGUAL ao inicio do relatorio
							// 2. A data de vencimento (d) tem que ser MENOR ou IGUAL ao fim do relatorio
							// 3. A data de vencimento (d) tem que ser MENOR que hoje (para ser atraso e não futuro)
							if (d >= startDate && d <= endDate && d < new Date()) {
								// Calcula o valor corrigido para ser justo
								const valorAtualizado = this.app.correctionCalculator.calcularValorCorrigido(parcel.value, parcel.dueDate);

								totalVencido += valorAtualizado;
								addData(vencidoByMonth, d, valorAtualizado);
							}
						}
					});

					// 3. Êxito (Recebido)
					if (contract.successFeePaymentDate) {
						const d = new Date(contract.successFeePaymentDate);
						if (d >= startDate && d <= endDate) {
							const value = contract.successFeeValueReceived;
							totalExito += value;
							detailedPayments.push({ type: 'Taxa de Êxito', clientName: contract.clientName, date: d, value: value, advogado: advogado });
							byAdvogado[advogado] = (byAdvogado[advogado] || 0) + value;
							addData(byMonth, d, value);
						}
					}
				});

				detailedPayments.sort((a, b) => a.date - b.date);
				const totalGeral = totalParcelas + totalExito;
				const totalContratos = Object.values(newContractsByMonth).reduce((a, b) => a + b, 0);

				return { totalParcelas, totalExito, totalGeral, totalContratos, totalVencido, detailedPayments, byAdvogado, byMonth, vencidoByMonth, newContractsByMonth };
			}
			getDefaultersInMonth(month, year, contracts) {
				const defaulters = [];
				const startMonth = new Date(year, month, 1);
				const endMonth = new Date(year, month + 1, 0, 23, 59, 59);

				contracts.forEach(c => {
					if (!c.parcels) return;
					c.parcels.forEach(p => {
						const dueDate = new Date(p.dueDate);
						const hoje = new Date();
						// Lógica: Venceu neste mês + Status é Pendente + Data já passou
						if (dueDate >= startMonth && dueDate <= endMonth && p.status === 'Pendente' && dueDate < hoje) {
							defaulters.push({
								client: c.clientName,
								advogado: c.advogadoResponsavel,
								dueDate: dueDate,
								value: p.value,
								parcelNum: `${p.number}/${c.parcels.length}`
							});
						}
					});
				});
				return defaulters;
			}
			// [FIM DA ALTERAÇÃO]

			// [NOVO v5.5] Agrega dados para o Painel de Admin
			calculateAdminPerformanceData(contractsToRender) {
				const hoje = new Date();
				const inicioAno = new Date(hoje.getFullYear(), 0, 1);
				const fimAno = new Date(hoje.getFullYear(), 11, 31, 23, 59, 59);

				const contratosAtivos = contractsToRender.filter(c => !c.isDeleted && this.app.getContractStatus(c).statusText !== 'Concluído');
				const faturamentoAno = this.calculateIncomeByDateRange(inicioAno, fimAno, contractsToRender);

				const contratosPorAdvogado = {};
				contratosAtivos.forEach(contract => {
					const advogado = contract.advogadoResponsavel || 'Não Informado';
					contratosPorAdvogado[advogado] = (contratosPorAdvogado[advogado] || 0) + 1;
				});

				const faturamentoPorAdvogado = faturamentoAno.byAdvogado;

				return { contratosPorAdvogado, faturamentoPorAdvogado };
			}

			// Função legada (ainda usada pelo modal antigo)
			calculateMonthlyIncome(year, month, contractsToRender) {
				const startDate = new Date(year, month, 1);
				const endDate = new Date(year, month + 1, 0, 23, 59, 59); // Fim do mês
				const data = this.calculateIncomeByDateRange(startDate, endDate, contractsToRender);
				return { totalParcelas: data.totalParcelas, totalExito: data.totalExito, totalGeral: data.totalGeral, detailedPayments: data.detailedPayments };
			}

			getActualIncomeData(contractsToRender) {
				const labels = [];
				const data = [];
				const hoje = new Date();

				for (let i = 11; i >= 0; i--) {
					const date = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
					labels.push(date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }));
					const income = this.calculateMonthlyIncome(date.getFullYear(), date.getMonth(), contractsToRender);
					data.push(income.totalGeral);
				}
				return { labels, data };
			}

			getProjectedIncomeData(contractsToRender) {
				const labels = [];
				const data = new Array(12).fill(0);
				const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
				const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

				for (let i = 0; i < 12; i++) {
					const date = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
					labels.push(date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }));
				}

				const filteredContracts = contractsToRender.filter(c => !c.isDeleted);
				for (const contract of filteredContracts) {
					if (!contract.parcels) continue;
					for (const parcel of contract.parcels) {
						if (parcel.status === 'Pendente') {
							const dueDate = new Date(parcel.dueDate);
							if (dueDate < inicioMesAtual) continue;
							const diffMonth = (dueDate.getFullYear() - inicioMesAtual.getFullYear()) * 12 + (dueDate.getMonth() - inicioMesAtual.getMonth());
							if (diffMonth >= 0 && diffMonth < 12) data[diffMonth] += parcel.value;
						}
					}
				}
				return { labels, data };
			}
		}

		/**
		 * @class DOMBuilder
		 */
		class DOMBuilder {
			constructor(appInstance) {
				this.app = appInstance;
			}

			buildIcon(classes) {
				const icon = document.createElement('i');
				icon.className = classes;
				return icon;
			}

			buildElement(tag, { className = '', text = '', html = '', id = '' } = {}) {
				const el = document.createElement(tag);
				if (className) el.className = className;
				if (text) el.textContent = text;
				if (html) el.innerHTML = html;
				if (id) el.id = id;
				return el;
			}

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Removidas as verificações 'isUserAdmin' para exibir valores
			createParcelCard(contract, parcel, index, type, remainingValue, valorCorrigido = null) {
				const formattedDate = Utils.formatDate(parcel.dueDate);
				const formattedValue = Utils.formatCurrency(parcel.value);
				const formattedRemaining = Utils.formatCurrency(remainingValue);
				const formattedCorrigido = valorCorrigido ? Utils.formatCurrency(valorCorrigido) : '';

				let borderColor = '';
				const card = this.buildElement('div', { className: 'dark-card shadow-lg p-4 rounded-lg transition-all duration-200 hover:-translate-y-1' });

				const title = this.buildElement('p', { className: 'font-bold text-white', text: contract.clientName });
				const services = (contract.serviceTypes || []).map(s => s.name).join(', ');
				const subtitle = this.buildElement('p', { className: 'text-sm text-gray-400 mb-3', text: `${services} - Parcela ${parcel.number}/${contract.parcels.length || 1}` });

				const details = this.buildElement('div', { className: 'space-y-2 text-sm' });
				let actionButton;

				if (type === 'vencida') {
					borderColor = 'border-red-500';
					details.innerHTML = `
					<div class="flex items-center text-gray-400 text-xs"><strong>Original:</strong><span class="ml-auto font-medium line-through">${formattedValue}</span></div>
					<div class="flex items-center text-red-400"><strong>Corrigido:</strong><span class="ml-auto font-semibold text-lg">${formattedCorrigido}</span></div>`;
				} else if (type === 'a-vencer') {
					borderColor = 'border-yellow-500';
					details.innerHTML = `<div class="flex items-center text-gray-300"><i class="fas fa-file-invoice-dollar w-5 text-center mr-2 text-gray-500"></i><strong>Valor:</strong><span class="ml-auto font-semibold text-lg text-white">${formattedValue}</span></div>`;
				} else {
					borderColor = 'border-gray-700';
					const formattedPaidValue = Utils.formatCurrency(parcel.valuePaid || 0);
					const paymentDate = Utils.formatDate(parcel.paymentDate);
					details.innerHTML = `<div class="flex items-center text-gray-300"><i class="fas fa-file-invoice-dollar w-5 text-center mr-2 text-gray-500"></i><strong>Valor:</strong><span class="ml-auto font-semibold text-lg text-white">${formattedValue}</span></div>`;
					actionButton = this.buildElement('div', {
						className: 'mt-4 text-center text-sm bg-green-900/50 text-green-300 p-2 rounded-md font-medium',
						text: `Pago ${formattedPaidValue} em ${paymentDate}`
					});
				}
				card.classList.add('border-l-4', borderColor);

				const vencimentoDiv = this.buildElement('div', { className: 'flex items-center text-gray-400' });
				vencimentoDiv.append(this.buildIcon('fas fa-calendar-alt w-5 text-center mr-2 text-gray-500'));
				vencimentoDiv.append(this.buildElement('strong', { text: 'Vencimento:' }));
				vencimentoDiv.append(this.buildElement('span', { className: 'ml-auto font-medium text-gray-300', text: formattedDate }));
				details.append(vencimentoDiv);

				card.append(title, subtitle, details);

				const extraInfo = this.buildElement('div', { className: 'text-xs text-gray-500 border-t border-gray-700 pt-2 mt-3 flex justify-between' });
				extraInfo.innerHTML = `<span>Contrato: <strong>${Utils.formatCurrency(contract.totalValue || 0)}</strong></span> <span>Restante: <strong>${formattedRemaining}</strong></span>`;
				card.append(extraInfo);

				if (type !== 'paga') {
					actionButton = this.buildElement('button', {
						className: 'mt-4 w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-2 px-3 rounded-lg text-sm shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2',
						html: '<i class="fas fa-check"></i> Registar Pagamento'
					});
					actionButton.onclick = () => window.App.openPaymentModal(contract.id, index);
				}
				if (actionButton) card.append(actionButton);

				return card;
			}

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Removida a verificação 'isUserAdmin' para exibir valor
			createExitoCard(contract) {
				const taxaExitoDisplay = contract.successFee || '[Não definido]';

				const card = this.buildElement('div', { className: 'dark-card shadow-lg p-4 rounded-lg transition-all duration-200 hover:-translate-y-1 border-l-4 border-indigo-500 w-80 flex-shrink-0 self-start' });
				card.append(this.buildElement('p', { className: 'font-bold text-white', text: contract.clientName }));

				const services = (contract.serviceTypes || []).map(s => s.name).join(', ');
				card.append(this.buildElement('p', { className: 'text-sm text-gray-400 mb-3', text: services }));

				const infoDiv = this.buildElement('div', { className: 'my-4 text-center' });
				infoDiv.append(this.buildElement('p', { className: 'text-sm text-gray-400', text: 'Bonificação Pendente' }));
				infoDiv.append(this.buildElement('p', { className: 'text-2xl font-semibold text-indigo-400', text: taxaExitoDisplay }));
				card.append(infoDiv);

				const button = this.buildElement('button', {
					className: 'w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold py-2 px-3 rounded-lg text-sm shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2',
					html: '<i class="fas fa-gavel"></i> Registar Recebimento'
				});
				button.onclick = () => window.App.openExitoModal(contract.id);
				card.append(button);

				return card;
			}

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Removida a verificação 'isUserAdmin' para exibir valores
			createContractCard(contract, statusInfo) {
				const { statusText, statusColor, borderColor } = statusInfo;

				const card = this.buildElement('div', { className: `dark-card shadow-lg rounded-lg overflow-hidden ${borderColor} flex flex-col justify-between transition-all duration-200 transform hover:-translate-y-1 hover:shadow-xl border-l-4` });
				const cardBody = this.buildElement('div', { className: 'p-5' });

				const header = this.buildElement('div', { className: 'flex justify-between items-start mb-3' });
				header.append(this.buildElement('h3', { className: 'font-bold text-xl text-white', text: contract.clientName }));
				header.append(this.buildElement('span', { className: `px-2 py-1 rounded-full text-xs font-semibold ${statusColor}`, text: statusText }));
				cardBody.append(header);

				const adv = this.buildElement('p', { className: 'text-xs text-indigo-300 mb-3' });
				adv.append(this.buildIcon('fas fa-user-tie mr-1'));
				adv.append(document.createTextNode(` ${contract.advogadoResponsavel}`));
				cardBody.append(adv);

				const servicesContainer = this.buildElement('div', { className: 'mb-4' });
				(contract.serviceTypes || []).forEach(s => {
					servicesContainer.append(this.buildElement('span', { className: 'service-tag-small', text: s.name }));
				});
				cardBody.append(servicesContainer);

				const financialInfo = this.buildElement('div', { className: 'border-t border-gray-700 pt-4 space-y-3 text-sm' });
				const valorFixoDisplay = Utils.formatCurrency(contract.totalValue);
				const exitoDisplay = contract.successFee || '';

				const fixedValueDiv = this.buildElement('div', { className: 'flex items-center text-gray-400' });
				fixedValueDiv.append(this.buildIcon('fas fa-file-invoice-dollar w-5 text-center mr-2 text-gray-500'));
				fixedValueDiv.append(this.buildElement('strong', { text: 'Valor Fixo:' }));
				fixedValueDiv.append(this.buildElement('span', { className: 'ml-auto font-medium text-gray-300', text: valorFixoDisplay }));
				financialInfo.append(fixedValueDiv);

				if (contract.successFee) {
					const exitoDiv = this.buildElement('div', { className: 'flex items-center text-gray-400' });
					exitoDiv.append(this.buildIcon('fas fa-star w-5 text-center mr-2 text-gray-500'));
					exitoDiv.append(this.buildElement('strong', { text: 'Êxito:' }));
					exitoDiv.append(this.buildElement('span', { className: 'ml-auto font-medium text-indigo-400', text: exitoDisplay }));
					financialInfo.append(exitoDiv);
				}
				cardBody.append(financialInfo);

				const footer = this.buildElement('div', { className: 'bg-gray-900/50 px-4 py-2 flex justify-end gap-2' });

				const historyBtn = this.buildElement('button', { className: 'text-sm flex items-center gap-2 text-gray-400 hover:text-indigo-400 hover:bg-indigo-900/20 py-1 px-3 rounded-md transition-colors', html: '<i class="fas fa-eye"></i> Histórico' });
				historyBtn.title = "Ver Histórico do Cliente";
				historyBtn.setAttribute('aria-label', `Ver Histórico do Cliente ${contract.clientName}`);
				historyBtn.onclick = () => window.App.openClientHistoryModal(contract.clientName);

				const editBtn = this.buildElement('button', { className: 'text-sm flex items-center gap-2 text-gray-400 hover:text-green-400 hover:bg-green-900/20 py-1 px-3 rounded-md transition-colors', html: '<i class="fas fa-pencil-alt"></i> Editar' });
				editBtn.title = "Editar Contrato";
				editBtn.setAttribute('aria-label', `Editar Contrato de ${contract.clientName}`);
				editBtn.onclick = () => window.App.openContractModal(contract.id);

				const deleteBtn = this.buildElement('button', { className: 'text-sm flex items-center gap-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 py-1 px-3 rounded-md transition-colors' });
				deleteBtn.append(this.buildIcon('fas fa-trash-alt'));
				deleteBtn.title = "Mover para Lixeira";
				deleteBtn.setAttribute('aria-label', `Mover Contrato de ${contract.clientName} para lixeira`);
				deleteBtn.onclick = () => window.App.moveToLixeira(contract.id);

				footer.append(historyBtn, editBtn, deleteBtn);
				card.append(cardBody, footer);
				return card;
			}

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Removida a verificação 'isUserAdmin' para exibir valores
			createParcelaCard({ contract, parcel, index, diffDays, valorCorrigido, isVencida }) {
				const valorOriginalDisplay = Utils.formatCurrency(parcel.value);
				const valorCorrigidoDisplay = Utils.formatCurrency(valorCorrigido);

				// [NOVO v5.6] Adiciona classes dinâmicas para Vencida / A Vencer
				const cardClasses = isVencida ? 'parcel-card-vencida' : 'parcel-card-avencer';
				const card = this.buildElement('div', { className: `dark-card shadow-lg p-5 rounded-lg border-l-4 ${cardClasses} transition-all duration-200 hover:-translate-y-1 hover:shadow-xl` });

				card.append(this.buildElement('p', { className: 'font-bold text-lg text-white', text: contract.clientName }));

				const services = (contract.serviceTypes || []).map(s => s.name).join(', ');
				card.append(this.buildElement('p', { className: 'text-sm text-gray-400 mb-3', text: `${services} - Parcela ${parcel.number}/${contract.parcels.length || 1}` }));

				const details = this.buildElement('div', { className: 'border-t border-gray-700 pt-3 mt-3 space-y-2' });

				if (isVencida) {
					// Card de VENCIDA (mostra original e corrigido)
					details.innerHTML = `
					<div class="flex justify-between items-center text-sm">
						<span class="text-gray-400">Valor Original:</span>
						<span class="font-medium text-gray-400 line-through">${valorOriginalDisplay}</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-sm text-white">Valor Corrigido:</span>
						<span class="font-semibold text-lg parcel-value">${valorCorrigidoDisplay}</span>
					</div>`;
				} else {
					// Card de A VENCER (mostra só o valor normal)
					details.innerHTML = `
					<div class="flex justify-between items-center">
						<span class="text-sm text-white">Valor:</span>
						<span class="font-semibold text-lg parcel-value">${valorOriginalDisplay}</span>
					</div>`;
				}

				details.innerHTML += `
				<div class="flex justify-between items-center text-sm">
					<span class="text-gray-400">Vence em:</span>
					<span class="font-medium text-gray-300">${Utils.formatDate(parcel.dueDate)}</span>
				</div>`;

				// [NOVO v5.6] Mostra "Atrasado há" ou "Faltam X dias"
				if (isVencida) {
					details.innerHTML += `
					<div class="flex justify-between items-center text-red-400 font-bold text-sm bg-red-900/30 px-2 py-1 rounded">
						<span>Atrasado há:</span>
						<span>${diffDays} dia(s)</span>
					</div>`;
				} else {
					details.innerHTML += `
					<div class="flex justify-between items-center text-yellow-400 font-bold text-sm bg-yellow-900/30 px-2 py-1 rounded">
						<span>Faltam:</span>
						<span>${diffDays * -1} dia(s)</span>
					</div>`;
				}

				card.append(details);

				// [NOVO v5.6] Adiciona botões de Ação (Pagar e Editar Contrato)
				const footer = this.buildElement('div', { className: 'mt-4 flex gap-2' });

				const payBtn = this.buildElement('button', {
					className: 'flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-2 px-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2',
					html: '<i class="fas fa-check"></i> Pagar'
				});
				payBtn.onclick = () => window.App.openPaymentModal(contract.id, index);

				const editBtn = this.buildElement('button', {
					className: 'flex-shrink-0 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2',
					html: '<i class="fas fa-pencil-alt"></i>'
				});
				editBtn.title = "Editar Contrato";
				editBtn.onclick = () => window.App.openContractModal(contract.id);

				footer.append(payBtn, editBtn);
				card.append(footer);

				return card;
			}

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Removida a verificação 'isUserAdmin' para exibir progresso financeiro
			createServicoCard(contract, serviceProgress, financialProgress) {
				const card = this.buildElement('div', { className: 'dark-card shadow-lg p-5 rounded-lg transition-all duration-200 hover:-translate-y-1' });

				const header = this.buildElement('div', { className: 'flex justify-between items-start' });
				header.append(this.buildElement('h3', { className: 'font-bold text-xl text-indigo-300 mb-4', text: contract.clientName }));
				header.append(this.buildElement('p', { className: 'text-sm text-gray-400', html: `<i class="fas fa-user-tie mr-1"></i> ${contract.advogadoResponsavel}` }));
				card.append(header);

				const progressBars = this.buildElement('div', { className: 'space-y-4 mb-4' });
				const financialProgressDiv = this.buildElement('div');
				financialProgressDiv.innerHTML = `
				<div class="flex justify-between text-sm mb-1 text-gray-300"><label>Progresso Financeiro</label><span class="font-medium text-teal-300">${financialProgress.toFixed(0)}%</span></div>
				<div class="progress-bar-bg h-3 w-full"><div class="progress-bar bg-teal-500" style="width: ${financialProgress}%"></div></div>`;
				progressBars.append(financialProgressDiv);

				const serviceProgressDiv = this.buildElement('div');
				serviceProgressDiv.innerHTML = `
				<div class="flex justify-between text-sm mb-1 text-gray-300"><label>Progresso dos Serviços</label><span class="font-medium text-indigo-300">${serviceProgress.toFixed(0)}%</span></div>
				<div class="progress-bar-bg h-3 w-full"><div class="progress-bar bg-indigo-500" style="width: ${serviceProgress}%"></div></div>`;
				progressBars.append(serviceProgressDiv);
				card.append(progressBars);

				const serviceListContainer = this.buildElement('div', { className: 'border-t border-gray-700 pt-3' });
				serviceListContainer.append(this.buildElement('h4', { className: 'font-semibold text-sm mb-2 text-gray-400', text: 'Serviços do Contrato:' }));
				const serviceList = this.buildElement('ul', { className: 'space-y-1' });

				(contract.serviceTypes || []).forEach((service, index) => {
					serviceList.append(this.createServiceListItem(contract, service, index));
				});

				serviceListContainer.append(serviceList);
				card.append(serviceListContainer);
				return card;
			}

			createServiceListItem(contract, service, index) {
				const li = this.buildElement('li', { className: 'flex items-center justify-between p-2 rounded-md' });

				const iconClass =
					service.status === 'Concluído' ? 'fas fa-check-circle text-teal-500' :
						service.status === '50% Concluído' ? 'fas fa-adjust text-purple-500' :
							service.status === 'Em Andamento' ? 'fas fa-spinner fa-spin text-yellow-500' :
								'far fa-circle text-gray-500';
				const textClass = service.status === 'Concluído' ? 'text-gray-500 line-through' : 'text-gray-300';
				li.classList.add(service.status !== 'Concluído' ? 'hover:bg-gray-700/50' : 'bg-gray-900/50');

				const serviceNameSpan = this.buildElement('span', { className: textClass });
				serviceNameSpan.append(this.buildIcon(`${iconClass} mr-2`));
				serviceNameSpan.append(document.createTextNode(service.name));

				const actionsDiv = this.buildElement('div', { className: 'flex items-center gap-2' });

				if (service.deadline) {
					const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
					const prazo = new Date(service.deadline + "T12:00:00Z");
					const diffDays = Math.ceil((prazo - hoje) / 86400000);
					const formattedPrazo = Utils.formatDate(prazo);
					let deadlineHtml = '', deadlineClass = '';

					if (diffDays < 0 && service.status !== 'Concluído') {
						deadlineHtml = `<i class="fas fa-exclamation-triangle"></i> Vencido: ${formattedPrazo}`;
						deadlineClass = 'text-xs font-medium text-red-400';
					} else if (diffDays <= 7 && service.status !== 'Concluído') {
						deadlineHtml = `<i class="fas fa-clock"></i> Vence: ${formattedPrazo}`;
						deadlineClass = 'text-xs font-medium text-yellow-400';
					} else if (service.status !== 'Concluído') {
						deadlineHtml = `<i class="far fa-calendar-alt"></i> ${formattedPrazo}`;
						deadlineClass = 'text-xs text-gray-500';
					} else {
						deadlineHtml = `<i class="far fa-calendar-check"></i> ${formattedPrazo}`;
						deadlineClass = 'text-xs text-gray-500';
					}
					actionsDiv.append(this.buildElement('span', { className: deadlineClass, html: deadlineHtml }));
				}

				let statusHtml = '', statusClass = '';
				switch (service.status) {
					case 'Concluído':
						statusClass = 'text-xs font-bold text-teal-400'; statusHtml = 'CONCLUÍDO';
						break;
					case '50% Concluído':
						statusClass = 'text-xs font-bold text-purple-400'; statusHtml = '50%';
						actionsDiv.append(this.createServiceButton('Concluir', 'bg-indigo-600 hover:bg-indigo-500', () => this.app.updateServiceStatus(contract, index, 'Concluído')));
						break;
					case 'Em Andamento':
						statusClass = 'text-xs font-bold text-yellow-400'; statusHtml = 'EM ANDAMENTO';
						actionsDiv.append(this.createServiceButton('50%', 'bg-purple-600 hover:bg-purple-500', () => this.app.updateServiceStatus(contract, index, '50% Concluído')));
						actionsDiv.append(this.createServiceButton('Concluir', 'bg-indigo-600 hover:bg-indigo-500', () => this.app.updateServiceStatus(contract, index, 'Concluído')));
						break;
					default:
						statusClass = 'text-xs font-bold text-gray-400'; statusHtml = 'PENDENTE';
						actionsDiv.append(this.createServiceButton('Iniciar', 'bg-yellow-600 hover:bg-yellow-500', () => this.app.updateServiceStatus(contract, index, 'Em Andamento')));
						break;
				}
				actionsDiv.append(this.buildElement('span', { className: statusClass, text: statusHtml }));

				li.append(serviceNameSpan, actionsDiv);
				return li;
			}

			createServiceButton(text, classes, onClick) {
				const btn = this.buildElement('button', {
					className: `text-xs text-white font-semibold py-1 px-2 rounded-md transition-colors ${classes}`,
					text: text
				});
				btn.onclick = onClick;
				return btn;
			}

			renderPaginationControls(container, totalItems, totalPages, currentPage) {
				container.innerHTML = '';
				if (totalPages <= 1) return;

				const createPageButton = (pageIndex, text = null, isDisabled = false, isActive = false) => {
					const btn = this.buildElement('button', {
						className: 'pagination-button',
						text: text !== null ? text : (pageIndex + 1)
					});
					if (isActive) btn.classList.add('active');
					if (isDisabled) {
						btn.disabled = true;
					} else {
						btn.onclick = () => window.App.changeContractPage(pageIndex);
					}
					return btn;
				};

				container.append(createPageButton(currentPage - 1, '« Ant', currentPage === 0));

				const maxVisibleButtons = 5;
				let startPage = Math.max(0, currentPage - Math.floor(maxVisibleButtons / 2));
				let endPage = Math.min(totalPages - 1, startPage + maxVisibleButtons - 1);
				if (endPage - startPage + 1 < maxVisibleButtons) {
					startPage = Math.max(0, endPage - maxVisibleButtons + 1);
				}

				if (startPage > 0) {
					container.append(createPageButton(0));
					if (startPage > 1) {
						container.append(this.buildElement('span', { text: '...' }));
					}
				}

				for (let i = startPage; i <= endPage; i++) {
					container.append(createPageButton(i, null, false, i === currentPage));
				}

				if (endPage < totalPages - 1) {
					if (endPage < totalPages - 2) {
						container.append(this.buildElement('span', { text: '...' }));
					}
					container.append(createPageButton(totalPages - 1));
				}

				container.append(createPageButton(currentPage + 1, 'Próx »', currentPage === totalPages - 1));
			}

			// [MUDANÇA v5] Novo: Cria item do dropdown de notificação
			createNotificationItem(notification) {
				const item = this.buildElement('div', { className: 'notification-item' });
				if (notification.isRead) item.classList.add('is-read');
				item.dataset.id = notification.id;

				item.innerHTML = `
					<p>${Utils.sanitizeText(notification.message)}</p>
					<div class="time">${Utils.timeAgo(notification.timestamp?.toDate())}</div>
				`;

				item.onclick = () => {
					// Marcar como lida e talvez navegar para o contrato
					if (!notification.isRead) {
						this.app.markNotificationsAsRead([notification.id]);
					}
					// TODO: Navegar para o contrato (ex: this.app.navigateToContract(notification.contractId))
					this.app.closeNotificationDropdown();
				};
				return item;
			}

			// [NOVO v5.5] Cria linha da tabela de ranking
			createRankingRow(rank, label, value) {
				const tr = this.buildElement('tr');
				let rankClass = '';
				if (rank === 1) rankClass = 'rank-1';
				else if (rank === 2) rankClass = 'rank-2';
				else if (rank === 3) rankClass = 'rank-3';

				tr.innerHTML = `
					<td class="${rankClass}">#${rank}</td>
					<td class="text-gray-300 font-medium">${label}</td>
					<td class="${rankClass}">${value}</td>
				`;
				return tr;
			}

			// [INÍCIO DA ALTERAÇÃO - OFICINA]
			// Novo: Cria item da lista de Configurações (ex: Advogados)
			createSettingListItem(name) {
				const item = this.buildElement('div', { className: 'setting-list-item' });
				item.innerHTML = `
					<span class="font-medium">${Utils.sanitizeText(name)}</span>
					<button class="setting-list-remove-btn" title="Remover ${Utils.sanitizeText(name)}">&times;</button>
				`;

				item.querySelector('.setting-list-remove-btn').onclick = () => {
					window.App.handleRemoveAdvogado(name);
				};
				return item;
			}
			// [FIM DA ALTERAÇÃO - OFICINA]

			// [INÍCIO DA ALTERAÇÃO - CONTRATO ESPECIAL]
			// Novo: Cria item da lista de parcelas manuais no modal
			createManualParcelListItem(value, date, index) {
				const item = this.buildElement('div', { className: 'parcel-list-item' });
				item.dataset.index = index;
				item.innerHTML = `
					<span>${Utils.formatCurrency(value)}</span>
					<span>Vence: ${Utils.formatDate(date)}</span>
					<button type="button" class="parcel-list-remove-btn" title="Remover Parcela">&times;</button>
				`;

				item.querySelector('.parcel-list-remove-btn').onclick = () => {
					window.App.handleRemoveManualParcel(index);
				};
				return item;
			}
			// [FIM DA ALTERAÇÃO]
		}
		/**
		 * @class App
		 * @description Classe principal que gere o estado e a lógica do dashboard
		 */
		class App {
			constructor() {
				// Estado da Aplicação
				this.database = {
					contracts: [],
					notifications: [], // [MUDANÇA v5]
					// [INÍCIO DA ALTERAÇÃO - OFICINA]
					// Inicia com um objeto padrão para advogados.
					// O listener do systemSettings irá preencher isso.
					settings: {
						advogados: { list: [] }
					}
					// [FIM DA ALTERAÇÃO - OFICINA]
				};
				this.currentUserDisplayName = null;
				this.currentSafeName = null; // [MUDANÇA v5]
				this.isUserAdmin = false;
				this.currentAdvancedReportData = null; // [MUDANÇA v5]
				this.currentPageId = null; // [CORREÇÃO v5.1]

				// [NOVO v5.4] Estado para controlar notificações de vencimento
				this.lastOverdueCheck = null;

				// [INÍCIO DA ALTERAÇÃO - CONTRATO ESPECIAL]
				this.manualParcels = []; // Array temporário para guardar parcelas manuais
				// [FIM DA ALTERAÇÃO]

				// Estado de UI
				this.currentContractSort = 'name-asc';
				this.currentParcelasSort = 'days-asc'; // [MUDANÇA v5.6] Renomeado e mudou o padrão
				this.currentServicosSort = 'name-asc';
				this.contractListPage = 0;
				this.contractStatusFilter = 'ativos';
				this.contractDateFilter = 'todos';
				this.showLegacyDebt = false; // Controla o botão do KPI// [NOVO] Filtro de data
				// [MUDANÇA v5] Referências DOM movidas para _initDOMReferences
				this.backdrop = null;
				this.appContainer = null;
				this.loadingOverlay = null;
				this.authOverlay = null;
				this.notificationBell = null;
				this.notificationBadge = null;
				this.notificationDropdown = null;
				this.notificationList = null;
				this.notificationListEmpty = null;
				this.clearNotificationsButton = null;

				// Estado dos Modais
				this.openModalId = null;
				this.lastFocusedElement = null;

				// Serviços Injetados
				this.authService = new AuthService(this);
				this.firebaseService = new FirebaseService(this);
				this.domBuilder = new DOMBuilder(this);
				this.reportHandler = new ReportHandler(this);
				this.analyticsHandler = new AnalyticsHandler(this);
				this.correctionCalculator = new CorrectionCalculator(this);
			}

			// --- 1. INICIALIZAÇÃO E EVENT LISTENERS ---

			initialize() {
				this.authService.initialize();
				// [MUDANÇA v5] Corrigido o "Race Condition"
				this._initDOMReferences();
				this.setupEventListeners();
				this._setupModalAccessibility();
			}

			// [MUDANÇA v5] Novo método para carregar referências DOM PÓS-DOMContentLoaded
			_initDOMReferences() {
				this.backdrop = document.getElementById('modal-backdrop');
				this.appContainer = document.getElementById('app-container');
				this.loadingOverlay = document.getElementById('loading-overlay');
				this.authOverlay = document.getElementById('auth-overlay');

				// Referências de Notificação
				this.notificationBell = document.getElementById('notification-bell');
				this.notificationBadge = document.getElementById('notification-badge');
				this.notificationDropdown = document.getElementById('notification-dropdown');
				this.notificationList = document.getElementById('notification-list');
				this.notificationListEmpty = document.getElementById('notification-list-empty');
				this.clearNotificationsButton = document.getElementById('clear-notifications-button');
			}

			setupEventListeners() {
				// Formulário de Login
				document.getElementById('login-form').addEventListener('submit', (e) => {
					e.preventDefault();
					const email = document.getElementById('login-email').value;
					const password = document.getElementById('login-password').value;
					this.authService.login(email, password);
				});

				// Botão de Logout
				document.getElementById('logout-button').addEventListener('click', () => {
					this.authService.logout();
				});

				// Formulário de Nome de Exibição
				document.getElementById('formDisplayName').addEventListener('submit', this.handleDisplayNameSubmit.bind(this));

				// Formulários de Modais
				document.getElementById('formContrato').addEventListener('submit', this.handleContractSubmit.bind(this));
				document.getElementById('formPagamento').addEventListener('submit', this.handlePaymentSubmit.bind(this));
				document.getElementById('formExito').addEventListener('submit', this.handleExitoSubmit.bind(this));

				// [INÍCIO DA ALTERAÇÃO - OFICINA]
				// Formulário da Oficina
				document.getElementById('formAddAdvogado').addEventListener('submit', this.handleAddAdvogado.bind(this));
				// [FIM DA ALTERAÇÃO - OFICINA]

				// Botão de Adicionar Serviço
				document.getElementById('addServiceButton').addEventListener('click', this.handleAddServiceTag.bind(this));

				// [INÍCIO DA ALTERAÇÃO - CONTRATO ESPECIAL]
				// Listener para a checkbox de Contrato Especial
				document.getElementById('contratoEspecial').addEventListener('change', this.toggleSpecialContractFields.bind(this));
				// Listener para o botão de adicionar parcela manual
				document.getElementById('addManualParcelButton').addEventListener('click', this.handleAddManualParcel.bind(this));
				// [FIM DA ALTERAÇÃO]

				// Inputs de Busca
				const debouncedContracts = Utils.debounce(() => this.resetAndRenderContractList(), 300);
				document.getElementById('searchInput').addEventListener('input', debouncedContracts);

				const debouncedServicos = Utils.debounce(() => this.renderServicosPage(), 300);
				document.getElementById('servicosSearchInput').addEventListener('input', debouncedServicos);

				// [MUDANÇA v5.6] Listener da busca de parcelas
				const debouncedParcelas = Utils.debounce(() => this.renderParcelasPage(), 300);
				document.getElementById('parcelasSearchInput').addEventListener('input', debouncedParcelas);

				// [REVOLUÇÃO] Listener do menu mobile
				document.getElementById('mobile-menu-toggle').addEventListener('click', () => {
					const sidebar = document.getElementById('sidebar');
					sidebar.classList.toggle('hidden'); // Alterna a sidebar
					if (!sidebar.classList.contains('hidden')) {
						this.backdrop.style.display = 'block'; // Mostra o backdrop para fechar
					} else {
						this.backdrop.style.display = 'none';
					}
				});

				// Listener do Backdrop (atualizado)
				if (this.backdrop) {
					this.backdrop.addEventListener('click', () => {
						// Fecha modal se estiver aberto
						if (this.openModalId && this.openModalId !== 'modalDisplayName') {
							this.closeModal(this.openModalId);
						}

						// [REVOLUÇÃO] Fecha a sidebar se estiver aberta no telemóvel
						const sidebar = document.getElementById('sidebar');
						if (window.innerWidth < 768 && !sidebar.classList.contains('hidden')) {
							sidebar.classList.add('hidden');
							this.backdrop.style.display = 'none';
						}
						// [MUDANÇA v5] Fecha o dropdown de notificação
						this.closeNotificationDropdown();
					});
				}

				// [MUDANÇA v5] Listeners do Sino de Notificação
				if (this.notificationBell) {
					this.notificationBell.addEventListener('click', (e) => {
						e.stopPropagation();
						this.notificationDropdown.classList.toggle('hidden');
					});
				}
				if (this.clearNotificationsButton) {
					this.clearNotificationsButton.addEventListener('click', () => {
						this.markNotificationsAsRead();
					});
				}
				// Fecha o dropdown se clicar fora
				document.addEventListener('click', (e) => {
					if (this.notificationDropdown && !this.notificationDropdown.classList.contains('hidden')) {
						if (!this.notificationBell.contains(e.target) && !this.notificationDropdown.contains(e.target)) {
							this.closeNotificationDropdown();
						}
					}
				});

				// [MUDANÇA v5] Listener do PDF
				const pdfBtn = document.getElementById('exportPdfButton');
				if (pdfBtn) {
					// [NOVO] Listener do Filtro de Data
					const filterBtn = document.getElementById('date-filter-toggle');
					if (filterBtn) {
						filterBtn.addEventListener('click', () => {
							const label = document.getElementById('date-filter-label');
							// Ciclo: Todos -> Novos -> Legados -> Todos
							if (this.contractDateFilter === 'todos') {
								this.contractDateFilter = 'novos';
								label.textContent = 'NOVOS';
								label.className = 'text-xs font-bold ml-1 bg-green-600 px-1 rounded';
								Utils.showToast('A mostrar: NOVOS (pós 01/11/25)', 'success');
							} else if (this.contractDateFilter === 'novos') {
								this.contractDateFilter = 'legados';
								label.textContent = 'LEGADOS';
								label.className = 'text-xs font-bold ml-1 bg-yellow-600 px-1 rounded';
								Utils.showToast('A mostrar: LEGADOS (pré 01/11/25)', 'info');
							} else {
								this.contractDateFilter = 'todos';
								label.textContent = 'TODOS';
								label.className = 'text-xs font-bold ml-1 bg-indigo-600 px-1 rounded';
								Utils.showToast('A mostrar: TODOS', 'info');
							}
							this.render(); // Atualiza a tela
						});
					}
					pdfBtn.addEventListener('click', () => this.exportReportPDF());
				}

				// [NOVO v5.6] Listeners para o modal de contrato
				const financialInputs = ['valorTotal', 'numParcelas', 'vencimentoPrimeiraParcela', 'contratoJaQuitado'];
				financialInputs.forEach(id => {
					document.getElementById(id)?.addEventListener('change', () => {
						document.getElementById('financialDataChanged').value = 'true';
					});
				});
				// [NOVO] Clique do botão do KPI de Vencidos
				const toggleDebtBtn = document.getElementById('toggle-debt-view');
				if (toggleDebtBtn) {
					toggleDebtBtn.addEventListener('click', (e) => {
						e.stopPropagation(); // Evita cliques indesejados
						this.showLegacyDebt = !this.showLegacyDebt; // Liga/Desliga
						this.render(); // Atualiza a tela

						const msg = this.showLegacyDebt ? "A mostrar DÍVIDA TOTAL (Histórico)." : "A mostrar DÍVIDA DO PERÍODO (Novos).";
						Utils.showToast(msg, 'info');
					});
				}
			}

			// --- 2. HANDLERS DE AUTENTICAÇÃO E DADOS ---

			handleAuthStateChange(user) {
				if (user) {
					// --- INÍCIO DO BLOCO DE TESTE ---
					const nomeDoFirebase = user.displayName;
					const nomeEmMinusculas = nomeDoFirebase ? nomeDoFirebase.toLowerCase() : '';
					const listaDeAdmins = ADMIN_USERS; // A lista global já está em minúsculas
					const euSouAdmin = listaDeAdmins.includes(nomeEmMinusculas);

					console.log("===============================");
					console.log("TESTE DE PERMISSÃO DA LIXEIRA");
					console.log("Nome lido do Firebase:", nomeDoFirebase);
					console.log("Nome convertido p/ minúsculas:", nomeEmMinusculas);
					console.log("Lista de Admins (minúsculas):", listaDeAdmins);
					console.log("O sistema me considera Admin?", euSouAdmin);
					console.log("===============================");
					// --- FIM DO BLOCO DE TESTE ---

					this.currentUserDisplayName = user.displayName;
					this.currentSafeName = Utils.sanitizeForFirestoreId(user.displayName);
					this.isUserAdmin = euSouAdmin; // Usa o resultado do nosso teste!

					document.body.classList.toggle('is-admin', this.isUserAdmin);

					if (!user.displayName) {
						// Primeiro login, pedir nome
						this.loadingOverlay.style.display = 'none';
						this.authOverlay.style.display = 'flex'; // Mostra o novo ecrã de login
						this.appContainer.style.display = 'none';
						this.openModal('modalDisplayName');
					} else {
						// Utilizador logado
						document.getElementById('user-display-name').textContent = user.displayName;
						this.loadingOverlay.style.display = 'none';
						this.authOverlay.style.display = 'none';
						this.appContainer.style.display = 'flex'; // [REVOLUÇÃO] Mudou para 'flex'
						this.setupUIAccess();
						this.firebaseService.startSnapshotListener('contracts');
						this.firebaseService.startNotificationListener(this.currentSafeName); // [MUDANÇA v5]
						// [INÍCIO DA ALTERAÇÃO - OFICINA]
						this.firebaseService.startSystemSettingsListener(); // Inicia o listener de configs
						// [FIM DA ALTERAÇÃO - OFICINA]
					}
				} else {
					// Utilizador deslogado
					this.currentUserDisplayName = null;
					this.currentSafeName = null;
					this.isUserAdmin = false;
					this.lastOverdueCheck = null; // [NOVO v5.4] Reseta o cheque de vencidos
					document.body.classList.remove('is-admin');
					this.authOverlay.style.display = 'flex'; // Mostra o novo ecrã de login
					this.appContainer.style.display = 'none';
					this.loadingOverlay.style.display = 'none';
					this.firebaseService.stopSnapshotListener();
					this.firebaseService.stopNotificationListener(); // [MUDANÇA v5]
					// [INÍCIO DA ALTERAÇÃO - OFICINA]
					this.firebaseService.stopSystemSettingsListener(); // Para o listener de configs
					// [FIM DA ALTERAÇÃO - OFICINA]
				}
			}

			handleSnapshotUpdate(contracts) {
				const oldContracts = this.database.contracts || [];
				this.database.contracts = contracts;

				// [NOVO v5.4] Checa por parcelas vencidas ao receber dados
				this.checkAndNotifyOverdue(oldContracts, contracts);

				this.contractListPage = 0;
				this.render();
			}

			// [MUDANÇA v5] Novo Handler de Notificações
			handleNotificationUpdate(notifications) {
				this.database.notifications = notifications;
				this.renderNotificationDropdown();
			}

			// [INÍCIO DA ALTERAÇÃO - OFICINA]
			// Novo Handler para as Configurações do Sistema
			handleSystemSettingsUpdate(settings) {
				// Certifica que a estrutura de 'advogados' existe
				if (!settings.advogados) {
					settings.advogados = { list: [] };
				}

				this.database.settings = settings;

				// Atualiza todos os componentes que dependem da lista de advogados
				this.renderAdvogadoFilters();
				this.populateAdvogadoSelectModal();

				// Se a página da oficina estiver aberta, renderiza-a
				if (this.currentPageId === 'page-oficina') {
					this.renderOficinaPage();
				}
			}
			// [FIM DA ALTERAÇÃO - OFICINA]

			// --- 3. LÓGICA DE RENDERIZAÇÃO PRINCIPAL ---

			render() {
				if (this.appContainer.style.display !== 'flex') return;

				// [CORREÇÃO v5.1] Usa o this.currentPageId
				const pageId = this.currentPageId;
				if (!pageId) {
					this.showPage('page-dashboard'); // Define o ID da página pela primeira vez
					return;
				}

				if (pageId === 'page-dashboard') {
					this.renderKanban(); // Não é mais async
					this.renderContractList();
				} else if (pageId === 'page-parcelas') { // [MUDANÇA v5.6]
					this.renderParcelasPage(); // [MUDANÇA v5.6]
				} else if (pageId === 'page-servicos') {
					this.renderServicosPage();
				} else if (pageId === 'page-lixeira') {
					this.renderLixeiraPage();
				} else if (pageId === 'page-relatorios') {
					this.renderAdvancedReportPage();
				} else if (pageId === 'page-performance') {
					this.renderPerformancePage(); // [NOVO v5.5]
				} else if (pageId === 'page-oficina') { // [INÍCIO DA ALTERAÇÃO - OFICINA]
					this.renderOficinaPage();
				} // [FIM DA ALTERAÇÃO - OFICINA]

				this.renderSortButtons();
				// [INÍCIO DA ALTERAÇÃO - OFICINA]
				// A linha this.renderAdvogadoFilters() foi movida de render() 
				// para handleSystemSettingsUpdate() para evitar que ela seja
				// chamada antes dos dados do Firebase serem carregados.
				// [FIM DA ALTERAÇÃO - OFICINA]
			}

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Lógica de renderização do Kanban e Dashboard atualizada
			renderKanban() {
				const contractsToRender = this.getFilteredContracts(false);

				const kanbanVencidas = document.getElementById('kanban-vencidas');
				const kanbanAVencer = document.getElementById('kanban-a-vencer');
				const kanbanPagas = document.getElementById('kanban-pagas');
				const kanbanExitoWrapper = document.getElementById('kanban-exito-wrapper');

				const fragVencidas = document.createDocumentFragment();
				const fragAVencer = document.createDocumentFragment();
				const fragPagas = document.createDocumentFragment();
				const fragExito = document.createDocumentFragment();

				const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
				const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
				const trintaDiasFrente = new Date(); trintaDiasFrente.setDate(hoje.getDate() + 30);

				// DATA DE CORTE: Define o que é "Dívida Velha" (antes de Nov/25)
				const DATA_CORTE_NOVOS = new Date('2025-11-01T00:00:00');

				let totalAVencer30dias = 0;
				let totalVencido = 0;
				let exitoPendente = 0;

				for (const contract of contractsToRender) {
					if (!contract.parcels) contract.parcels = [];
					let remainingValue = contract.parcels.reduce((sum, p) => p.status === 'Pendente' ? sum + p.value : sum, 0);

					for (let i = 0; i < contract.parcels.length; i++) {
						const parcel = contract.parcels[i];
						const vencimento = new Date(parcel.dueDate);

						if (parcel.status === 'Paga') {
							const dataPagamento = new Date(parcel.paymentDate);
							if (dataPagamento >= primeiroDiaMes && dataPagamento <= hoje) {
								fragPagas.append(this.domBuilder.createParcelCard(contract, parcel, i, 'paga', remainingValue));
							}
						} else {
							if (vencimento < hoje) {
								// [AQUI ESTÁ O SEGREDO DO BOTÃO]
								// Se estamos na aba 'NOVOS' 
								// E o botão de ver histórico está DESLIGADO (!this.showLegacyDebt)
								// E a parcela venceu antes de Novembro/25
								// ENTÃO: Pula essa parcela (não mostra, não soma).
								if (this.contractDateFilter === 'novos' && !this.showLegacyDebt && vencimento < DATA_CORTE_NOVOS) {
									continue;
								}

								const valorCorrigido = this.correctionCalculator.calcularValorCorrigido(parcel.value, parcel.dueDate);
								totalVencido += valorCorrigido;
								fragVencidas.append(this.domBuilder.createParcelCard(contract, parcel, i, 'vencida', remainingValue, valorCorrigido));
							} else if (vencimento >= hoje && vencimento <= trintaDiasFrente) {
								fragAVencer.append(this.domBuilder.createParcelCard(contract, parcel, i, 'a-vencer', remainingValue));
								totalAVencer30dias += parcel.value;
							}
						}
					}

					if (contract.successFee && !contract.successFeePaymentDate && (contract.parcels || []).every(p => p.status === 'Paga')) {
						fragExito.append(this.domBuilder.createExitoCard(contract));
						exitoPendente++;
					}
				}

				kanbanVencidas.innerHTML = '';
				kanbanAVencer.innerHTML = '';
				kanbanPagas.innerHTML = '';
				kanbanExitoWrapper.innerHTML = '';

				kanbanVencidas.append(fragVencidas);
				kanbanAVencer.append(fragAVencer);
				kanbanPagas.append(fragPagas);

				if (exitoPendente > 0) {
					kanbanExitoWrapper.append(fragExito);
					document.getElementById('exito-section').style.display = 'block';
				} else {
					document.getElementById('exito-section').style.display = 'none';
				}

				const allContracts = this.getFilteredContracts(true);
				const totalPagoMes = this.reportHandler.calculateMonthlyIncome(hoje.getFullYear(), hoje.getMonth(), allContracts).totalGeral;

				this.renderDashboard(totalAVencer30dias, totalVencido, totalPagoMes, contractsToRender.length);

				// [CONTROLE VISUAL DO BOTÃO]
				const toggleBtn = document.getElementById('toggle-debt-view');
				const toggleIcon = document.getElementById('toggle-debt-icon');

				if (toggleBtn) {
					// Só mostra o botão se estivermos na aba "NOVOS"
					if (this.contractDateFilter === 'novos') {
						toggleBtn.classList.remove('hidden');

						// Muda o ícone: Olho (Aberto = Tudo) / Filtro (Fechado = Só Novos)
						if (this.showLegacyDebt) {
							toggleIcon.className = 'fas fa-eye text-red-400'; // Modo Histórico
							toggleBtn.title = "A mostrar TUDO (Clique para filtrar)";
						} else {
							toggleIcon.className = 'fas fa-filter text-gray-500'; // Modo Filtrado
							toggleBtn.title = "A mostrar Período (Clique para ver histórico)";
						}
					} else {
						// Esconde o botão se estiver em "Todos" ou "Legados"
						toggleBtn.classList.add('hidden');
						this.showLegacyDebt = false;
					}
				}
			}
			renderDashboard(aVencer, vencido, pago, totalContratos) {
				document.getElementById('dash-a-receber').textContent = Utils.formatCurrency(aVencer);
				document.getElementById('dash-vencido').textContent = Utils.formatCurrency(vencido);
				document.getElementById('dash-recebido').textContent = Utils.formatCurrency(pago);
				document.getElementById('dash-contratos').textContent = totalContratos;
			}
			// [FIM DA ALTERAÇÃO]

			renderContractList() {
				const listContainer = document.getElementById('contractListContainer');
				const searchTerm = (document.getElementById('searchInput').value || '').toLowerCase();
				const advogadoFilterEl = document.getElementById('advogadoFilter');

				let advogadoFilter = advogadoFilterEl ? advogadoFilterEl.value : 'Todos';
				if (!this.isUserAdmin) advogadoFilter = this.currentUserDisplayName;

				// 1. Filtra os contratos (incluindo o novo filtro de status)
				let filteredContracts = this.getFilteredContracts(false).filter(c => {
					const statusInfo = this.getContractStatus(c);
					const isConcluido = statusInfo.statusText === 'Concluído';

					if (this.contractStatusFilter === 'ativos' && isConcluido) return false;
					if (this.contractStatusFilter === 'concluidos' && !isConcluido) return false;

					const matchesAdvogado = (this.isUserAdmin && advogadoFilter === 'Todos') || c.advogadoResponsavel === advogadoFilter;
					const matchesSearch = c.clientName.toLowerCase().includes(searchTerm) || (c.serviceTypes || []).some(s => s.name.toLowerCase().includes(searchTerm));
					return matchesAdvogado && matchesSearch;
				});

				// 2. Ordena os contratos
				if (this.currentContractSort === 'name-asc') {
					filteredContracts.sort((a, b) => a.clientName.localeCompare(b.clientName));
				} else if (this.currentContractSort === 'value-desc') { // [INÍCIO DA ALTERAÇÃO] Removido 'isUserAdmin' da condição de ordenação
					filteredContracts.sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0));
				} // [FIM DA ALTERAÇÃO]

				// 3. Calcula paginação
				const totalItems = filteredContracts.length;
				const totalPages = Math.ceil(totalItems / CONTRACTS_PER_PAGE);

				if (this.contractListPage >= totalPages && totalPages > 0) this.contractListPage = totalPages - 1;
				if (this.contractListPage < 0) this.contractListPage = 0;

				const startIndex = this.contractListPage * CONTRACTS_PER_PAGE;
				const paginatedContracts = filteredContracts.slice(startIndex, startIndex + CONTRACTS_PER_PAGE);

				// 4. Renderiza
				listContainer.innerHTML = '';
				const paginationContainer = document.getElementById('paginationContainer');

				if (totalItems === 0) {
					listContainer.innerHTML = `<div class="dark-card shadow-lg p-4 rounded-lg text-center text-gray-400 py-4">Nenhum contrato ${this.contractStatusFilter === 'ativos' ? 'ativo' : 'concluído'} encontrado.</div>`;
					this.domBuilder.renderPaginationControls(paginationContainer, 0, 0, 0);
					return;
				}

				const gridContainer = this.domBuilder.buildElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8' });
				const fragment = document.createDocumentFragment();

				paginatedContracts.forEach(contract => {
					const statusInfo = this.getContractStatus(contract);
					fragment.append(this.domBuilder.createContractCard(contract, statusInfo));
				});

				gridContainer.append(fragment);
				listContainer.append(gridContainer);

				this.domBuilder.renderPaginationControls(paginationContainer, totalItems, totalPages, this.contractListPage);
			}

			// [MUDANÇA v5.6] Renomeada de 'renderInadimplentesPage' para 'renderParcelasPage'
			renderParcelasPage() {
				const contractsToRender = this.getFilteredContracts(false);
				const container = document.getElementById('parcelasListContainer');
				const searchTerm = (document.getElementById('parcelasSearchInput').value || '').toLowerCase();

				container.innerHTML = `<div class="col-span-1 md:col-span-3 text-center py-10"><i class="fas fa-spinner fa-spin fa-2x text-indigo-400"></i><p class="mt-2 text-sm text-gray-400">A calcular...</p></div>`;
				const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

				let parcelasList = [];
				contractsToRender.forEach(contract => {
					if (!contract.clientName.toLowerCase().includes(searchTerm)) return;
					if (!contract.parcels) return;

					for (let i = 0; i < contract.parcels.length; i++) {
						const parcel = contract.parcels[i];
						// [NOVO v5.6] Mostra TODAS as parcelas pendentes
						if (parcel.status === 'Pendente') {
							const vencimento = new Date(parcel.dueDate);
							const diffDays = Math.ceil((vencimento - hoje) / 86400000);
							const isVencida = vencimento < hoje;
							const valorCorrigido = isVencida ? this.correctionCalculator.calcularValorCorrigido(parcel.value, parcel.dueDate) : parcel.value;

							parcelasList.push({ contract, parcel, index: i, diffDays, valorCorrigido, isVencida });
						}
					}
				});

				// [MUDANÇA v5.6] Nova ordenação
				if (this.currentParcelasSort === 'days-asc') {
					parcelasList.sort((a, b) => a.diffDays - b.diffDays); // Mais próximas primeiro
				} else if (this.currentParcelasSort === 'value-desc') { // [INÍCIO DA ALTERAÇÃO] Removido 'isUserAdmin'
					parcelasList.sort((a, b) => b.valorCorrigido - a.valorCorrigido); // Mais caras primeiro
				} else if (this.currentParcelasSort === 'name-asc') {
					parcelasList.sort((a, b) => a.contract.clientName.localeCompare(b.contract.clientName));
				}

				container.innerHTML = '';
				if (parcelasList.length === 0) {
					container.innerHTML = `<div class="col-span-1 md:col-span-3 text-center py-10"><div class="inline-block bg-gray-800 border border-gray-700 text-green-400 p-6 rounded-lg shadow-md"><i class="fas fa-check-circle fa-3x mb-3"></i><p class="font-bold text-xl">Nenhuma parcela pendente!</p><p class="text-sm text-gray-400">Todos os pagamentos estão em dia.</p></div></div>`;
					return;
				}

				const fragment = document.createDocumentFragment();
				parcelasList.forEach(item => {
					fragment.append(this.domBuilder.createParcelaCard(item)); // [MUDANÇA v5.6]
				});
				container.append(fragment);
			}

			renderServicosPage() {
				const contractsToRender = this.getFilteredContracts(false);
				const container = document.getElementById('servicosListContainer');
				const searchTerm = (document.getElementById('servicosSearchInput').value || '').toLowerCase();
				const advogadoFilterEl = document.getElementById('servicosAdvogadoFilter');
				let advogadoFilter = advogadoFilterEl ? advogadoFilterEl.value : 'Todos';
				if (!this.isUserAdmin) advogadoFilter = this.currentUserDisplayName;

				container.innerHTML = '';

				let activeContracts = contractsToRender.filter(c => {
					const matchesAdvogado = (this.isUserAdmin && advogadoFilter === 'Todos') || c.advogadoResponsavel === advogadoFilter;
					const matchesSearch = c.clientName.toLowerCase().includes(searchTerm) || (c.serviceTypes || []).some(s => s.name.toLowerCase().includes(searchTerm)) || c.advogadoResponsavel.toLowerCase().includes(searchTerm);
					return matchesAdvogado && matchesSearch;
				});

				if (this.currentServicosSort === 'name-asc') {
					activeContracts.sort((a, b) => a.clientName.localeCompare(b.clientName));
				} else if (this.currentServicosSort === 'adv-asc') {
					activeContracts.sort((a, b) => a.advogadoResponsavel.localeCompare(b.advogadoResponsavel));
				}

				// Filtra os que não têm serviços
				activeContracts = activeContracts.filter(c => c.serviceTypes && c.serviceTypes.length > 0);

				if (activeContracts.length === 0) {
					container.innerHTML = `<div class="text-center py-10"><div class="inline-block dark-card shadow-lg text-indigo-400 p-6 rounded-lg"><i class="fas fa-coffee fa-3x mb-3"></i><p class="font-bold text-xl">Nenhum contrato ativo encontrado.</p><p class="text-sm text-gray-400">Nenhum resultado para a busca ou todos os trabalhos estão concluídos.</p></div></div>`;
					return;
				}

				const fragment = document.createDocumentFragment();
				activeContracts.forEach(contract => {
					const totalServices = (contract.serviceTypes || []).length;
					let progressValue = 0;
					(contract.serviceTypes || []).forEach(service => {
						if (service.status === 'Concluído') progressValue += 1;
						else if (service.status === '50% Concluído') progressValue += 0.5;
						else if (service.status === 'Em Andamento') progressValue += 0.25;
					});
					const serviceProgress = totalServices > 0 ? (progressValue / totalServices) * 100 : 0;

					const totalPaid = (contract.parcels || []).reduce((sum, p) => sum + (p.valuePaid || 0), 0) + (contract.successFeeValueReceived || 0);
					const financialProgress = (contract.totalValue || 0) > 0 ? (totalPaid / contract.totalValue) * 100 : (totalPaid > 0 ? 100 : 0);

					// Só mostra se o serviço não estiver 100%
					if (serviceProgress < 100) {
						fragment.append(this.domBuilder.createServicoCard(contract, serviceProgress, financialProgress));
					}
				});

				if (fragment.children.length === 0) {
					container.innerHTML = `<div class="text-center py-10"><div class="inline-block dark-card shadow-lg text-green-400 p-6 rounded-lg"><i class="fas fa-check-double fa-3x mb-3"></i><p class="font-bold text-xl">Todos os serviços estão concluídos.</p><p class="text-sm text-gray-400">Nenhum serviço pendente para os filtros selecionados.</p></div></div>`;
					return;
				}

				container.append(fragment);
			}

			// [CORREÇÃO LIXEIRA] Esta é a lógica correta, baseada no v5.0 do usuário
			renderLixeiraPage() {
				// Pega TODOS os contratos, incluindo deletados
				const contractsToRender = this.getFilteredContracts(true);
				const container = document.getElementById('lixeiraListContainer');
				container.innerHTML = '';

				// Filtra APENAS os deletados
				const deletedContracts = contractsToRender.filter(c => c.isDeleted === true);

				if (deletedContracts.length === 0) {
					container.innerHTML = `<div class="col-span-1 md:col-span-3 text-center py-10"><div class="inline-block dark-card shadow-lg text-gray-400 p-6 rounded-lg"><i class="fas fa-trash fa-3x mb-3"></i><p class="font-bold text-xl">Lixeira Vazia</p><p class="text-sm">Nenhum contrato foi excluído.</p></div></div>`;
					return;
				}

				const fragment = document.createDocumentFragment();
				deletedContracts.forEach(contract => {
					const card = this.domBuilder.buildElement('div', { className: 'dark-card shadow-lg p-5 rounded-lg border-l-4 border-gray-600 transition-all duration-200 hover:-translate-y-1' });
					card.append(this.domBuilder.buildElement('p', { className: 'font-bold text-lg text-white', text: contract.clientName }));
					const services = (contract.serviceTypes || []).map(s => s.name).join(', ');
					card.append(this.domBuilder.buildElement('p', { className: 'text-sm text-gray-400 mb-3', text: services }));

					const footer = this.domBuilder.buildElement('div', { className: 'border-t border-gray-700 pt-3 mt-3 flex gap-2' });

					const restoreBtn = this.domBuilder.buildElement('button', { className: 'w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-2 px-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2', html: '<i class="fas fa-undo"></i> Restaurar' });
					restoreBtn.onclick = () => this.restoreContract(contract.id);
					footer.append(restoreBtn);

					if (this.isUserAdmin) {
						const deleteBtn = this.domBuilder.buildElement('button', { className: 'w-full bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 text-white font-semibold py-2 px-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2', html: '<i class="fas fa-times-circle"></i> Excluir Prmt.' });
						deleteBtn.onclick = () => this.deleteContractPermanently(contract.id);
						footer.append(deleteBtn);
					}

					card.append(footer);
					fragment.append(card);
				});
				container.append(fragment);
			}
			// [MUDANÇA v5] Nova Página de Relatórios
			renderAdvancedReportPage() {
				// Define datas padrão (início do mês até hoje)
				const startDateEl = document.getElementById('reportStartDate');
				const endDateEl = document.getElementById('reportEndDate');
				if (!startDateEl.value || !endDateEl.value) {
					const hoje = new Date();
					const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
					startDateEl.value = inicioMes.toISOString().split('T')[0];
					endDateEl.value = hoje.toISOString().split('T')[0];
				}
				// Limpa o estado anterior
				this.currentAdvancedReportData = null;
				document.getElementById('exportPdfButton').disabled = true;
				document.getElementById('advancedReportContainer').classList.add('hidden');
				document.getElementById('advancedReportEmpty').classList.remove('hidden');

				// [CORREÇÃO v5.2] Chama o destrutor específico da página
				this.analyticsHandler.destroyPageCharts('page-relatorios');
			}

			// [NOVO v5.5] Nova Página de Performance (Admin)
			renderPerformancePage() {
				if (!this.isUserAdmin) return;

				// Limpa gráficos antigos
				this.analyticsHandler.destroyPageCharts('page-performance');

				// Pega todos os contratos (incluindo da lixeira, para cálculos históricos)
				const allContracts = this.getFilteredContracts(true);
				const { contratosPorAdvogado, faturamentoPorAdvogado } = this.reportHandler.calculateAdminPerformanceData(allContracts);

				// 1. Renderiza Gráfico 1 (Contratos Ativos por Advogado)
				const contratosLabels = Object.keys(contratosPorAdvogado);
				const contratosData = Object.values(contratosPorAdvogado);
				const contratosCtx = document.getElementById('adminChartContratos').getContext('2d');
				this.analyticsHandler.renderAdminContratosChart(contratosCtx, contratosLabels, contratosData);

				// 2. Renderiza Gráfico 2 (Faturamento por Advogado)
				const faturamentoLabels = Object.keys(faturamentoPorAdvogado);
				const faturamentoData = Object.values(faturamentoPorAdvogado);
				const faturamentoCtx = document.getElementById('adminChartFaturamento').getContext('2d');
				this.analyticsHandler.renderAdminFaturamentoChart(faturamentoCtx, faturamentoLabels, faturamentoData);

				// 3. Renderiza Tabela 1 (Ranking Faturamento)
				const fatRanking = Object.entries(faturamentoPorAdvogado)
					.sort(([, a], [, b]) => b - a); // Ordena do maior para o menor
				const fatTableBody = document.getElementById('adminTableFaturamento').querySelector('tbody');
				fatTableBody.innerHTML = '';
				fatRanking.forEach(([label, value], index) => {
					fatTableBody.append(this.domBuilder.createRankingRow(index + 1, label, Utils.formatCurrency(value)));
				});

				// 4. Renderiza Tabela 2 (Ranking Contratos)
				const contRanking = Object.entries(contratosPorAdvogado)
					.sort(([, a], [, b]) => b - a); // Ordena do maior para o menor
				const contTableBody = document.getElementById('adminTableContratos').querySelector('tbody');
				contTableBody.innerHTML = '';
				contRanking.forEach(([label, value], index) => {
					contTableBody.append(this.domBuilder.createRankingRow(index + 1, label, `${value} contrato(s)`));
				});
			}

			// [INÍCIO DA ALTERAÇÃO - OFICINA]
			// Nova: Renderiza a página da Oficina
			renderOficinaPage() {
				const listContainer = document.getElementById('advogadoSettingsList');
				if (!listContainer) return;

				listContainer.innerHTML = ''; // Limpa a lista antiga
				const fragment = document.createDocumentFragment();
				const advogadosList = this.database.settings.advogados?.list || [];

				if (advogadosList.length === 0) {
					listContainer.innerHTML = `<p class="text-sm text-gray-400 text-center p-4">Nenhum advogado cadastrado.</p>`;
					return;
				}

				// Ordena alfabeticamente para exibição
				[...advogadosList].sort().forEach(name => {
					fragment.append(this.domBuilder.createSettingListItem(name));
				});
				listContainer.append(fragment);
			}
			// [FIM DA ALTERAÇÃO - OFICINA]

			// --- 4. LÓGICA DE UI (Filtros, Abas, Helpers) ---

			showPage(pageId) {
				const pageTitles = {
					'page-dashboard': 'Painel Principal',
					'page-parcelas': 'Controle de Parcelas', // [MUDANÇA v5.6]
					'page-servicos': 'Produção de Serviços',
					'page-performance': 'Performance Gerencial',
					'page-relatorios': 'Relatórios Avançados',
					'page-lixeira': 'Lixeira',
					'page-oficina': 'Oficina de Configurações' // [INÍCIO DA ALTERAÇÃO - OFICINA]
				};

				// [NOVO v5.5] Destrói gráficos se ESTIVERMOS a SAIR da página de relatórios OU performance
				if (this.currentPageId === 'page-relatorios' && pageId !== 'page-relatorios') {
					this.analyticsHandler.destroyPageCharts('page-relatorios');
				}
				if (this.currentPageId === 'page-performance' && pageId !== 'page-performance') {
					this.analyticsHandler.destroyPageCharts('page-performance');
				}
				// [INÍCIO DA ALTERAÇÃO - OFICINA]
				if (this.currentPageId === 'page-oficina' && pageId !== 'page-oficina') {
					this.analyticsHandler.destroyPageCharts('page-oficina');
				}
				// [FIM DA ALTERAÇÃO - OFICINA]

				this.currentPageId = pageId; // Define a página atual

				document.getElementById('page-title').textContent = pageTitles[pageId] || 'Painel';

				// Esconde todas as páginas
				['page-dashboard', 'page-parcelas', 'page-servicos', 'page-lixeira', 'page-relatorios', 'page-performance', 'page-oficina'].forEach(id => {
					const el = document.getElementById(id);
					if (el) el.classList.add('hidden');
				});

				// Remove 'active' de todas as tabs
				document.querySelectorAll('.sidebar-nav-item, .mobile-nav-item').forEach(tab => {
					tab.classList.remove('active');
				});

				// Mostra a página alvo
				const targetPage = document.getElementById(pageId);
				if (targetPage) targetPage.classList.remove('hidden');

				// Ativa a tab correspondente
				const tabBaseId = pageId.split('-')[1];
				const desktopTab = document.getElementById(`tab-${tabBaseId}`);
				const mobileTab = document.getElementById(`mobile-tab-${tabBaseId}`);

				if (desktopTab) desktopTab.classList.add('active');
				if (mobileTab) mobileTab.classList.add('active');

				// Fecha a sidebar no mobile
				const sidebar = document.getElementById('sidebar');
				if (window.innerWidth < 768 && !sidebar.classList.contains('hidden')) {
					sidebar.classList.add('hidden');
					this.backdrop.style.display = 'none';
				}

				// Renderiza o conteúdo da página que acabou de ser aberta
				this.render();
			}

			setupUIAccess() {
				const isAdmin = this.isUserAdmin;
				const advogadoFilters = [
					document.getElementById('advogadoFilter'),
					document.getElementById('servicosAdvogadoFilter')
				];
				advogadoFilters.forEach(select => {
					if (select) {
						select.disabled = !isAdmin;
						select.value = isAdmin ? 'Todos' : this.currentUserDisplayName;
					}
				});

				// [MUDANÇA v5.6] IDs dos campos financeiros
				const financialFields = ['valorTotal', 'numParcelas', 'vencimentoPrimeiraParcela', 'taxaExito', 'contratoJaQuitado'];
				financialFields.forEach(id => {
					const field = document.getElementById(id);
					if (field) field.disabled = !isAdmin;
				});

				// [INÍCIO DA ALTERAÇÃO - OFICINA]
				// Não chama mais o populate aqui, será chamado pelo handleSystemSettingsUpdate
				// [FIM DA ALTERAÇÃO - OFICINA]
			}

			getFilteredContracts(includeDeleted = false) {
				const allContracts = this.database.contracts;
				// Data de corte: 01 de Novembro de 2025 (mês 10 no JS pois começa em 0)
				const DIVISOR_DATE = new Date(2025, 10, 1);

				let filtered = [];
				// 1. Filtro de Usuário vs Admin
				if (this.isUserAdmin) {
					filtered = includeDeleted ? allContracts : allContracts.filter(c => !c.isDeleted);
				} else {
					filtered = allContracts.filter(c => c.advogadoResponsavel === this.currentUserDisplayName && (includeDeleted ? true : !c.isDeleted));
				}

				// 2. [NOVO] Filtro de Data (Novos vs Legados)
				if (this.contractDateFilter !== 'todos') {
					filtered = filtered.filter(c => {
						// Se não tiver data de criação, assume que é antigo (2020)
						const dataCriacao = c.createdAt ? new Date(c.createdAt) : new Date('2020-01-01');
						if (this.contractDateFilter === 'novos') {
							return dataCriacao >= DIVISOR_DATE;
						} else if (this.contractDateFilter === 'legados') {
							return dataCriacao < DIVISOR_DATE;
						}
						return true;
					});
				}
				return filtered;
			}

			// [MUDANÇA v3] Lógica de "Concluído" atualizada
			getContractStatus(contract) {
				const allParcelsPaid = (contract.parcels || []).every(p => p.status === 'Paga');
				const allServicesDone = (contract.serviceTypes || []).every(s => s.status === 'Concluído');

				if (allParcelsPaid && allServicesDone) {
					if (contract.successFee && !contract.successFeePaymentDate) {
						return { statusText: 'Aguardando Êxito', statusColor: 'bg-indigo-900/50 text-indigo-300', borderColor: 'border-indigo-500' };
					}
					return { statusText: 'Concluído', statusColor: 'bg-gray-700 text-gray-300', borderColor: 'border-gray-600' };
				}

				// Se não está concluído, mas parcelas estão pagas, está "Em Andamento (Serviços)"
				if (allParcelsPaid && !allServicesDone) {
					return { statusText: 'Em Andamento', statusColor: 'bg-blue-900/50 text-blue-300', borderColor: 'border-blue-500' };
				}

				// Se parcelas estão pendentes, está "Ativo (Pagamento)"
				return { statusText: 'Ativo', statusColor: 'bg-yellow-900/50 text-yellow-300', borderColor: 'border-yellow-500' };
			}

			// [MUDANÇA v5.6] Renomeado 'inadimplentesSortContainer' para 'parcelasSortContainer'
			renderSortButtons() {
				const contractSortContainer = document.getElementById('contractSortButtons');
				const parcelasSortContainer = document.getElementById('parcelasSortButtons');
				const servicosSortContainer = document.getElementById('servicosSortButtons');
				const contractStatusFilterContainer = document.getElementById('contractStatusFilterButtons');
				if (!contractSortContainer || !parcelasSortContainer || !servicosSortContainer || !contractStatusFilterContainer) return;

				const createButton = (container, sortKey, sortLabel, currentSort, callback) => {
					const button = this.domBuilder.buildElement('button', { text: sortLabel, className: 'sort-button' });
					if (currentSort === sortKey) button.classList.add('active');
					button.onclick = () => {
						callback(sortKey);
						this.render();
						this.renderSortButtons();
					};
					container.append(button);
				};

				// Limpa
				contractSortContainer.innerHTML = '';
				parcelasSortContainer.innerHTML = '';
				servicosSortContainer.innerHTML = '';
				contractStatusFilterContainer.innerHTML = '';

				// Botões de Status (Ativos/Concluídos)
				createButton(contractStatusFilterContainer, 'ativos', 'Ativos', this.contractStatusFilter, (key) => { this.contractStatusFilter = key; this.resetAndRenderContractList(); });
				createButton(contractStatusFilterContainer, 'concluidos', 'Concluídos', this.contractStatusFilter, (key) => { this.contractStatusFilter = key; this.resetAndRenderContractList(); });

				// Botões da lista de Contratos
				createButton(contractSortContainer, 'name-asc', 'Nome (A-Z)', this.currentContractSort, (key) => { this.currentContractSort = key; this.resetAndRenderContractList(); });
				// [INÍCIO DA ALTERAÇÃO] Removido 'isUserAdmin'
				createButton(contractSortContainer, 'value-desc', 'Valor (Maior)', this.currentContractSort, (key) => { this.currentContractSort = key; this.resetAndRenderContractList(); });
				// [FIM DA ALTERAÇÃO]

				// [MUDANÇA v5.6] Botões de Parcelas (substitui Inadimplentes)
				createButton(parcelasSortContainer, 'days-asc', 'Venc. Próximo', this.currentParcelasSort, (key) => { this.currentParcelasSort = key; });
				createButton(parcelasSortContainer, 'name-asc', 'Nome (A-Z)', this.currentParcelasSort, (key) => { this.currentParcelasSort = key; });
				// [INÍCIO DA ALTERAÇÃO] Removido 'isUserAdmin'
				createButton(parcelasSortContainer, 'value-desc', 'Maior Valor', this.currentParcelasSort, (key) => { this.currentParcelasSort = key; });
				// [FIM DA ALTERAÇÃO]

				// Botões de Serviços
				createButton(servicosSortContainer, 'name-asc', 'Cliente (A-Z)', this.currentServicosSort, (key) => { this.currentServicosSort = key; });
				createButton(servicosSortContainer, 'adv-asc', 'Advogado (A-Z)', this.currentServicosSort, (key) => { this.currentServicosSort = key; });
			}

			// [INÍCIO DA ALTERAÇÃO - OFICINA]
			// Esta função agora lê a lista de advogados do 'this.database.settings' (Firebase)
			renderAdvogadoFilters() {
				// Usa a lista do Firebase
				const allNames = new Set(this.database.settings.advogados?.list || []);

				const filterSelects = [document.getElementById('advogadoFilter'), document.getElementById('servicosAdvogadoFilter')];

				filterSelects.forEach(select => {
					if (!select) return;
					const currentValue = select.value;
					select.innerHTML = '<option value="Todos">Todos</option>';
					select.add(new Option("Não Informado", "Não Informado"));

					// Popula com a lista do Firebase
					[...allNames].filter(adv => adv && adv !== "Não Informado" && adv !== "Todos").sort().forEach(adv => {
						select.add(new Option(adv, adv));
					});

					select.value = this.isUserAdmin ? (currentValue || 'Todos') : this.currentUserDisplayName;
					select.disabled = !this.isUserAdmin;
				});
			}

			// Esta função agora lê a lista de advogados do 'this.database.settings' (Firebase)
			populateAdvogadoSelectModal() {
				const select = document.getElementById('advogadoResponsavel');
				if (!select) return;
				const currentValue = select.value;
				select.innerHTML = '';
				select.add(new Option("Não Informado", "Não Informado"));

				// Usa a lista do Firebase
				const allNames = new Set(this.database.settings.advogados?.list || []);

				// Popula com a lista do Firebase
				[...allNames].filter(adv => adv && adv !== "Não Informado").sort().forEach(adv => {
					select.add(new Option(adv, adv));
				});

				select.value = currentValue && currentValue !== 'Não Informado' ? currentValue : (this.isUserAdmin ? 'Não Informado' : this.currentUserDisplayName);
				select.disabled = !this.isUserAdmin && !!this.currentUserDisplayName;
			}
			// [FIM DA ALTERAÇÃO - OFICINA]

			changeContractPage(pageIndex) {
				this.contractListPage = pageIndex;
				this.renderContractList();
				document.getElementById('main-content').scrollTop = 0;
			}

			resetAndRenderContractList() {
				this.contractListPage = 0;
				this.renderContractList();
			}

			// --- 5. LÓGICA DE AÇÕES (CRUD) ---

			async handleDisplayNameSubmit(e) {
				e.preventDefault();
				const name = document.getElementById('inputDisplayName').value;
				if (name && (await this.authService.updateUserProfile(name))) {
					// Recarrega a página para forçar o handleAuthStateChange a rodar
					// com o novo nome e definir as permissões de admin corretamente.
					window.location.reload();
				}
			}

			// [INÍCIO DA ALTERAÇÃO - CONTRATO ESPECIAL]
			// Lógica de SUBMIT de contrato ATUALIZADA
			async handleContractSubmit(e) {
				e.preventDefault();
				const contractId = document.getElementById('contractId').value;
				const financialDataChanged = document.getElementById('financialDataChanged').value === 'true';
				const isSpecialContract = document.getElementById('contratoEspecial').checked;

				const serviceTags = document.querySelectorAll('#servicosContainer .service-tag');
				const serviceTypes = Array.from(serviceTags).map(tag => ({
					name: Utils.sanitizeText(tag.dataset.name),
					status: tag.dataset.status || 'Pendente',
					deadline: tag.dataset.deadline || null
				}));
				if (serviceTypes.length === 0) { Utils.showToast('Adicione pelo menos um serviço.', 'error'); return; }

				const contractData = {
					clientName: Utils.sanitizeText(document.getElementById('clienteNome').value),
					clientContact: Utils.sanitizeText(document.getElementById('clienteContato').value),
					advogadoResponsavel: Utils.sanitizeText(document.getElementById('advogadoResponsavel').value),
					serviceTypes,
					paymentType: Utils.sanitizeText(document.getElementById('contratoTipoPagamento').value),
					observations: Utils.sanitizeText(document.getElementById('contratoObservacoes').value),
					isSpecialContract: isSpecialContract // Salva o tipo de contrato
				};

				// Função helper para gerar parcelas PADRÃO
				const generateStandardParcels = () => {
					const parcels = [];
					const totalValue = Utils.parseNumber(document.getElementById('valorTotal').value);
					const numParcels = parseInt(document.getElementById('numParcelas').value) || 1;
					const firstDueDate = document.getElementById('vencimentoPrimeiraParcela').value;
					const jaQuitado = document.getElementById('contratoJaQuitado').checked;

					if (numParcels > 0 && totalValue > 0) {
						if (!firstDueDate && !jaQuitado) {
							Utils.showToast('Informe data da 1ª parcela.', 'error');
							return null; // Indica falha
						}
						const parcelValue = totalValue / numParcels;
						let currentDueDate = new Date((firstDueDate || new Date().toISOString().split('T')[0]) + 'T12:00:00Z');
						for (let i = 0; i < numParcels; i++) {
							const isPaid = jaQuitado && numParcels === 1;
							parcels.push({
								number: i + 1, value: parcelValue,
								dueDate: new Date(currentDueDate).toISOString(),
								status: isPaid ? 'Paga' : 'Pendente',
								valuePaid: isPaid ? parcelValue : 0,
								paymentDate: isPaid ? new Date().toISOString() : null
							});
							currentDueDate.setMonth(currentDueDate.getMonth() + 1);
						}
					}
					return { parcels, totalValue };
				};

				// Função helper para gerar parcelas ESPECIAIS
				const generateManualParcels = () => {
					if (this.manualParcels.length === 0) {
						Utils.showToast('Adicione pelo menos uma parcela manual.', 'error');
						return null; // Indica falha
					}
					let totalValue = 0;
					const parcels = this.manualParcels.map((p, i) => {
						totalValue += p.value;
						return {
							number: i + 1,
							value: p.value,
							dueDate: new Date(p.dueDate + 'T12:00:00Z').toISOString(),
							status: 'Pendente',
							valuePaid: 0,
							paymentDate: null
						};
					});
					return { parcels, totalValue };
				};


				if (this.isUserAdmin) {
					let generatedData;

					if (isSpecialContract) {
						// Lógica de Contrato Especial
						generatedData = generateManualParcels();
					} else {
						// Lógica de Contrato Padrão
						generatedData = generateStandardParcels();
					}

					if (generatedData === null) return; // Falha na validação

					Object.assign(contractData, {
						totalValue: generatedData.totalValue,
						parcels: generatedData.parcels,
						successFee: Utils.sanitizeText(document.getElementById('taxaExito').value) || null,
					});
				}

				// [NOVO v5.8] Anexa arquivos da fila se houver (Criação)
				if (this.contractAttachmentsQueue && this.contractAttachmentsQueue.length > 0) {
					contractData.contractAttachments = this.contractAttachmentsQueue;
				}

				if (!contractId) {
					// --- CRIAÇÃO DE NOVO CONTRATO ---
					if (!this.isUserAdmin) {
						// Se não for admin, cria contrato sem dados financeiros
						contractData.parcels = [];
						contractData.totalValue = 0;
						contractData.successFee = null;
					}

					Object.assign(contractData, {
						successFeeValueReceived: 0,
						successFeePaymentDate: null,
						isDeleted: false,
						createdAt: new Date().toISOString()
					});

					if (await this.firebaseService.addContract(contractData)) {
						this.closeModal('modalContrato');
						// [NOVO v5.4] Notifica admins sobre novo contrato
						this.sendNotificationToAllAdmins({
							message: `${this.currentUserDisplayName} criou um novo contrato para: ${contractData.clientName}.`,
							sender: this.currentUserDisplayName
						});
					}
				} else {
					// --- ATUALIZAÇÃO DE CONTRATO EXISTENTE ---
					const existingContract = this.database.contracts.find(c => c.id === contractId);

					// Preserva dados financeiros se não for admin
					if (!this.isUserAdmin && existingContract) {
						contractData.totalValue = existingContract.totalValue;
						contractData.successFee = existingContract.successFee;
						contractData.parcels = existingContract.parcels;
					}

					// [CORREÇÃO BUG EDIÇÃO] Se for admin e os dados financeiros mudaram
					if (this.isUserAdmin && financialDataChanged) {
						let generatedData;
						if (isSpecialContract) {
							generatedData = generateManualParcels();
						} else {
							generatedData = generateStandardParcels();
						}

						if (generatedData === null) return; // Falha na validação

						contractData.parcels = generatedData.parcels; // Sobrescreve as parcelas antigas
						contractData.totalValue = generatedData.totalValue; // Sobrescreve o valor total
						Utils.showToast('Parcelas recalculadas com sucesso!', 'info');
					} else if (existingContract) {
						// Mantém as parcelas existentes se nada mudou
						contractData.parcels = existingContract.parcels;
						contractData.totalValue = existingContract.totalValue; // Mantém valor total
					}

					// Preserva outros campos importantes
					contractData.successFeeValueReceived = existingContract?.successFeeValueReceived || 0;
					contractData.successFeePaymentDate = existingContract?.successFeePaymentDate || null;
					contractData.isDeleted = existingContract?.isDeleted || false;
					contractData.createdAt = existingContract?.createdAt || new Date().toISOString();

					if (await this.firebaseService.updateContract(contractId, contractData)) {
						this.closeModal('modalContrato');
					}
				}
			}
			// [FIM DA ALTERAÇÃO]

			async handlePaymentSubmit(e) {
				e.preventDefault();
				const contractId = document.getElementById('pagamentoContractId').value;
				const parcelIndex = parseInt(document.getElementById('pagamentoParcelIndex').value);
				const contract = this.database.contracts.find(c => c.id === contractId);

				// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
				// Se for admin, pega o valor do input. Se não for, pega o valor original da parcela.
				const valuePaid = this.isUserAdmin
					? Utils.parseNumber(document.getElementById('pagamentoValor').value)
					: (contract?.parcels[parcelIndex]?.value || 0);
				// [FIM DA ALTERAÇÃO]

				const paymentDate = document.getElementById('pagamentoData').value;

				if (contract && !isNaN(valuePaid) && valuePaid > 0) { // Adicionada verificação > 0
					const updatedParcels = [...(contract.parcels || [])];
					const parcel = updatedParcels[parcelIndex];
					parcel.status = 'Paga';
					parcel.valuePaid = valuePaid;
					parcel.paymentDate = new Date(paymentDate + 'T12:00:00Z').toISOString();

					// [NOVO] Processar anexo se existir
					const anexoFile = document.getElementById('pagamentoAnexo').files[0];
					if (anexoFile) {
						if (Utils.validateFileSize(anexoFile, 0.3)) {
							const base64Data = await Utils.fileToBase64(anexoFile);
							if (!parcel.attachments) parcel.attachments = [];
							parcel.attachments.push({
								name: anexoFile.name,
								type: anexoFile.type,
								data: base64Data,
								uploadedAt: new Date().toISOString(),
								uploadedBy: this.currentUserDisplayName
							});
						} else {
							Utils.showToast('Anexo ignorado: muito grande (>300KB).', 'error');
						}
					}

					const success = await this.firebaseService.updateContractField(contractId, { parcels: updatedParcels });
					if (success) {
						this.closeModal('modalPagamento');
						Utils.showToast('Pagamento registado.', 'success');
						// [NOVO v5.4] Notifica advogado sobre pagamento
						this.sendNotification(contract.advogadoResponsavel, {
							message: `Pagamento de ${Utils.formatCurrency(valuePaid)} (Parcela ${parcel.number}) registado para ${contract.clientName}.`,
							contractId: contractId,
							sender: this.currentUserDisplayName
						});
					}
				} else {
					Utils.showToast('Valor de pagamento inválido.', 'error');
				}
			}

			async handleExitoSubmit(e) {
				e.preventDefault();
				const contractId = document.getElementById('exitoContractId').value;
				const valueReceived = this.isUserAdmin ? Utils.parseNumber(document.getElementById('exitoValorRecebido').value) : 0;
				const contract = this.database.contracts.find(c => c.id === contractId);

				if (contract) {
					if (this.isUserAdmin && (isNaN(valueReceived) || valueReceived <= 0)) {
						Utils.showToast('Valor de êxito inválido.', 'error');
						return;
					}
					const success = await this.firebaseService.updateContractField(contractId, {
						successFeeValueReceived: valueReceived,
						successFeePaymentDate: new Date().toISOString()
					});
					if (success) {
						this.closeModal('modalExito');
						Utils.showToast('Êxito registado.', 'success');
						// [NOVO v5.4] Notifica advogado sobre pagamento de êxito
						this.sendNotification(contract.advogadoResponsavel, {
							message: `Pagamento de Êxito (${Utils.formatCurrency(valueReceived)}) registado para ${contract.clientName}.`,
							contractId: contractId,
							sender: this.currentUserDisplayName
						});
					}
				}
			}

			handleAddServiceTag() {
				const nameInput = document.getElementById('contratoServicoInput');
				const deadlineInput = document.getElementById('contratoPrazoInput');
				const serviceName = Utils.sanitizeText(nameInput.value);
				const deadline = deadlineInput.value || null;

				if (serviceName) {
					this.createServiceTag(serviceName, deadline, 'Pendente');
					nameInput.value = '';
					deadlineInput.value = '';
					nameInput.focus();
				} else {
					Utils.showToast('Por favor, insira um nome para o serviço.', 'error');
				}
			}

			// [MUDANÇA v5] Atualizado para aceitar 'contract' e enviar notificação
			async updateServiceStatus(contract, serviceIndex, newStatus) {
				const contractId = contract.id;
				if (contract && (contract.serviceTypes || [])[serviceIndex]) {
					const updatedServiceTypes = [...contract.serviceTypes];
					const serviceName = updatedServiceTypes[serviceIndex].name;
					updatedServiceTypes[serviceIndex].status = newStatus;

					const success = await this.firebaseService.updateContractField(contractId, { serviceTypes: updatedServiceTypes });

					// Lógica de Notificação (Apenas para 'Concluído')
					if (success && newStatus === 'Concluído') {
						this.sendNotification(contract.advogadoResponsavel, {
							message: `${this.currentUserDisplayName} concluiu o serviço "${serviceName}" no contrato ${contract.clientName}.`,
							contractId: contractId,
							sender: this.currentUserDisplayName
						});
					}
				}
			}

			// [NOVO v5.4] Função helper para enviar notificação a um usuário
			async sendNotification(recipientName, data) {
				// Não envia notificação para o próprio usuário
				if (!recipientName || recipientName === this.currentUserDisplayName) return;

				const safeRecipientName = Utils.sanitizeForFirestoreId(recipientName);
				await this.firebaseService.sendNotification(safeRecipientName, data);
				// Utils.showToast('Notificação enviada.', 'info'); // Opcional: bom para debug
			}

			// [NOVO v5.4] Função helper para enviar notificação para TODOS os admins
			async sendNotificationToAllAdmins(data) {
				ADMIN_USERS.forEach(adminName => {
					// Envia para todos os admins, exceto o usuário que causou a ação
					if (adminName.toLowerCase() !== this.currentUserDisplayName?.toLowerCase()) {
						const safeAdminName = Utils.sanitizeForFirestoreId(adminName);
						this.firebaseService.sendNotification(safeAdminName, data);
					}
				});
			}

			// [NOVO v5.4] Verifica e envia notificações sobre parcelas vencidas
			checkAndNotifyOverdue(oldContracts, newContracts) {
				const hoje = new Date();
				const hojeStr = hoje.toISOString().split('T')[0]; // YYYY-MM-DD

				// Roda apenas uma vez por dia
				if (this.lastOverdueCheck === hojeStr) return;

				const yesterday = new Date(hoje);
				yesterday.setDate(hoje.getDate() - 1);
				const ontemStr = yesterday.toISOString().split('T')[0];

				// Itera apenas sobre os contratos do usuário atual (ou todos se for admin)
				const contractsToCheck = this.getFilteredContracts(false);

				contractsToCheck.forEach(contract => {
					(contract.parcels || []).forEach(parcel => {
						// Se a parcela estava Pendente e venceu ONTEM
						if (parcel.status === 'Pendente' && parcel.dueDate.startsWith(ontemStr)) {
							console.log(`[Notificação Vencida] Enviando para: ${contract.advogadoResponsavel}`);
							this.sendNotification(contract.advogadoResponsavel, {
								message: `Atenção: A parcela ${parcel.number} (${Utils.formatCurrency(parcel.value)}) do contrato ${contract.clientName} venceu ontem.`,
								contractId: contract.id,
								sender: "Sistema"
							});
						}
					});
				});

				this.lastOverdueCheck = hojeStr; // Marca como checado hoje
			}

			async moveToLixeira(contractId) {
				const contract = this.database.contracts.find(c => c.id === contractId);
				if (!contract) return;
				const ok = await Utils.confirm(`Tem a certeza que deseja mover o contrato de "${contract.clientName}" para a lixeira?`);
				if (!ok) return;

				const success = await this.firebaseService.updateContractField(contractId, { isDeleted: true });
				if (success) Utils.showToast('Contrato movido para a lixeira.', 'success');
			}

			async restoreContract(contractId) {
				const ok = await Utils.confirm(`Tem a certeza que deseja restaurar este contrato?`);
				if (!ok) return;
				const success = await this.firebaseService.updateContractField(contractId, { isDeleted: false });
				if (success) Utils.showToast('Contrato restaurado.', 'success');
			}

			async deleteContractPermanently(contractId) {
				if (!this.isUserAdmin) return;
				const ok = await Utils.confirm(`EXCLUSÃO PERMANENTE: Tem a certeza? Esta ação não pode ser desfeita.`);
				if (!ok) return;
				await this.firebaseService.deleteContract(contractId);
			}

			// [INÍCIO DA ALTERAÇÃO - OFICINA]
			// Nova: Lida com a adição de um advogado
			async handleAddAdvogado(e) {
				e.preventDefault();
				if (!this.isUserAdmin) return;

				const nameInput = document.getElementById('inputAdvogadoName');
				const newName = Utils.sanitizeText(nameInput.value);

				if (!newName) {
					Utils.showToast('Nome não pode estar vazio.', 'error');
					return;
				}

				// Pega a lista atual (ou uma lista vazia)
				const currentList = this.database.settings.advogados?.list || [];

				if (currentList.map(name => name.toLowerCase()).includes(newName.toLowerCase())) {
					Utils.showToast('Este advogado já está na lista.', 'error');
					return;
				}

				// Adiciona o novo nome à lista local
				const updatedList = [...currentList, newName];

				// Salva a lista COMPLETA de volta no Firestore
				const success = await this.firebaseService.saveSystemSettings('advogados', { list: updatedList });

				if (success) {
					nameInput.value = '';
					// O listener 'onSnapshot' (handleSystemSettingsUpdate)
					// irá automaticamente re-renderizar a UI.
				}
			}

			// Nova: Lida com a remoção de um advogado
			async handleRemoveAdvogado(nameToRemove) {
				if (!this.isUserAdmin) return;

				const ok = await Utils.confirm(`Tem a certeza que deseja remover "${nameToRemove}" da lista?`);
				if (!ok) return;

				const currentList = this.database.settings.advogados?.list || [];

				// Filtra a lista, removendo o nome
				const updatedList = currentList.filter(name => name !== nameToRemove);

				// Salva a lista COMPLETA de volta no Firestore
				await this.firebaseService.saveSystemSettings('advogados', { list: updatedList });

				// O listener 'onSnapshot' (handleSystemSettingsUpdate)
				// irá automaticamente re-renderizar a UI.
			}
			// [FIM DA ALTERAÇÃO - OFICINA]

			// [INÍCIO DA ALTERAÇÃO - CONTRATO ESPECIAL]
			handleAddManualParcel() {
				const valorInput = document.getElementById('parcelaValorManual');
				const vencimentoInput = document.getElementById('parcelaVencimentoManual');
				const value = Utils.parseNumber(valorInput.value);
				const dueDate = vencimentoInput.value;

				if (value <= 0) {
					Utils.showToast('Por favor, insira um valor válido para a parcela.', 'error');
					return;
				}
				if (!dueDate) {
					Utils.showToast('Por favor, selecione uma data de vencimento.', 'error');
					return;
				}

				this.manualParcels.push({ value, dueDate });
				this.manualParcels.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)); // Ordena por data

				this.renderManualParcelList();
				valorInput.value = '';
				vencimentoInput.value = '';
				valorInput.focus();
				document.getElementById('financialDataChanged').value = 'true';
			}

			handleRemoveManualParcel(index) {
				this.manualParcels.splice(index, 1);
				this.renderManualParcelList();
				document.getElementById('financialDataChanged').value = 'true';
			}

			renderManualParcelList() {
				const listContainer = document.getElementById('manualParcelList');
				listContainer.innerHTML = '';
				if (this.manualParcels.length === 0) {
					listContainer.innerHTML = `<p class="text-xs text-gray-500 text-center p-2">Nenhuma parcela adicionada.</p>`;
					return;
				}

				const fragment = document.createDocumentFragment();
				this.manualParcels.forEach((parcel, index) => {
					fragment.append(this.domBuilder.createManualParcelListItem(parcel.value, parcel.dueDate, index));
				});
				listContainer.append(fragment);
			}

			toggleSpecialContractFields(event) {
				const isChecked = event.target.checked;
				document.getElementById('financial-fields-standard').style.display = isChecked ? 'none' : 'block';
				document.getElementById('financial-fields-special').style.display = isChecked ? 'block' : 'none';
				document.getElementById('financialDataChanged').value = 'true';
			}
			// [FIM DA ALTERAÇÃO]

			// --- 6. LÓGICA DE MODAIS (com Acessibilidade) ---

			openModal(modalId) {
				this.lastFocusedElement = document.activeElement;

				const modals = document.querySelectorAll('.modal');
				modals.forEach(m => { if (m && m.style.display === 'block' && m.id !== modalId) m.style.display = 'none'; });

				const modal = document.getElementById(modalId);
				if (modal) modal.style.display = 'block';

				if (this.backdrop) this.backdrop.style.display = 'block';
				document.body.style.overflow = 'hidden';
				this.appContainer.setAttribute('aria-hidden', 'true');
				this.openModalId = modalId;

				const firstFocusableEl = modal.querySelector('button, [href], input, select, textarea');
				if (firstFocusableEl) firstFocusableEl.focus();
			}

			closeModal(modalId) {
				const el = document.getElementById(modalId);
				if (el) el.style.display = 'none';

				if (this.openModalId === modalId) this.openModalId = null;

				const anyOpen = Array.from(document.querySelectorAll('.modal')).some(m => m.style.display === 'block');

				if (this.backdrop && !anyOpen) {
					this.backdrop.style.display = 'none';
					document.body.style.overflow = '';
					this.appContainer.setAttribute('aria-hidden', 'false');
					if (this.lastFocusedElement) this.lastFocusedElement.focus();
				}

				// [CORREÇÃO v5.2] Chama o destrutor específico do MODAL
				if (modalId === 'modalRelatorio') {
					this.analyticsHandler.destroyModalCharts();
				}
			}

			// [NOVO v5.7] Lógica de Upload de Anexo
			async handleFileUpload(contractId, parcelIndex, file) {
				if (!contractId || parcelIndex === undefined || !file) return;

				// 1. Validação de Tamanho (300KB)
				if (!Utils.validateFileSize(file, 0.3)) {
					Utils.showToast('O arquivo é muito grande. Máximo: 300KB (Use PDF ou Imagem comprimida).', 'error');
					return;
				}

				try {
					Utils.showToast('A enviar anexo...', 'info');
					// 2. Converter para Base64
					const base64Data = await Utils.fileToBase64(file);

					// 3. Atualizar Contrato no Firebase
					const contract = this.database.contracts.find(c => c.id === contractId);
					if (!contract) return;

					const updatedParcels = [...contract.parcels];
					if (!updatedParcels[parcelIndex].attachments) {
						updatedParcels[parcelIndex].attachments = [];
					}

					updatedParcels[parcelIndex].attachments.push({
						name: file.name,
						type: file.type,
						data: base64Data,
						uploadedAt: new Date().toISOString(),
						uploadedBy: this.currentUserDisplayName // Opcional: Rastreabilidade
					});

					const success = await this.firebaseService.updateContractField(contractId, { parcels: updatedParcels });
					if (success) {
						Utils.showToast('Anexo adicionado com sucesso!', 'success');
					}
				} catch (error) {
					console.error("Erro no upload:", error);
					Utils.showToast('Erro ao processar arquivo.', 'error');
				}
			}

			// [NOVO v5.7] Lógica de Remoção de Anexo
			async handleRemoveAttachment(contractId, parcelIndex, attachmentIndex) {
				const contract = this.database.contracts.find(c => c.id === contractId);
				if (!contract) return;

				const updatedParcels = [...contract.parcels];
				if (updatedParcels[parcelIndex] && updatedParcels[parcelIndex].attachments) {
					updatedParcels[parcelIndex].attachments.splice(attachmentIndex, 1);

					const success = await this.firebaseService.updateContractField(contractId, { parcels: updatedParcels });
					if (success) {
						Utils.showToast('Anexo removido.', 'success');
					}
				}
			}

			// [NOVO v5.8] Upload de Arquivos do Contrato (Geral)
			async handleContractFileUpload(contractId, file) {
				if (!file) return;
				if (!Utils.validateFileSize(file, 0.3)) {
					Utils.showToast('Arquivo muito grande (>300KB).', 'error');
					return;
				}

				try {
					const base64Data = await Utils.fileToBase64(file);
					const attachment = {
						name: file.name,
						type: file.type,
						data: base64Data,
						uploadedAt: new Date().toISOString(),
						uploadedBy: this.currentUserDisplayName
					};

					if (contractId) {
						// Modo Edição: Salva direto no Firebase
						Utils.showToast('Enviando arquivo...', 'info');
						const contract = this.database.contracts.find(c => c.id === contractId);
						if (!contract) return;
						const currentAtts = [...(contract.contractAttachments || []), attachment];
						const success = await this.firebaseService.updateContractField(contractId, { contractAttachments: currentAtts });
						if (success) {
							Utils.showToast('Arquivo do contrato adicionado.', 'success');
							this.renderContractAttachmentsList(currentAtts, contractId);
						}
					} else {
						// Modo Criação: Adiciona à fila
						this.contractAttachmentsQueue = this.contractAttachmentsQueue || [];
						this.contractAttachmentsQueue.push(attachment);
						this.renderContractAttachmentsList(this.contractAttachmentsQueue, null);
					}
				} catch (e) {
					console.error(e);
					Utils.showToast('Erro ao processar arquivo.', 'error');
				}
			}

			// [NOVO v5.8] Remover Arquivo do Contrato
			async handleRemoveContractAttachment(contractId, index) {
				if (contractId) {
					// Modo Edição
					const contract = this.database.contracts.find(c => c.id === contractId);
					if (!contract) return;
					const currentAtts = [...(contract.contractAttachments || [])];
					currentAtts.splice(index, 1);
					const success = await this.firebaseService.updateContractField(contractId, { contractAttachments: currentAtts });
					if (success) {
						Utils.showToast('Arquivo removido.', 'success');
						this.renderContractAttachmentsList(currentAtts, contractId);
					}
				} else {
					// Modo Criação
					this.contractAttachmentsQueue.splice(index, 1);
					this.renderContractAttachmentsList(this.contractAttachmentsQueue, null);
				}
			}

			// [NOVO v5.8] Renderiza a lista de arquivos do contrato no modal
			renderContractAttachmentsList(files, contractId) {
				const container = document.getElementById('contractFilesList');
				if (!container) return;
				container.innerHTML = '';

				if (!files || files.length === 0) return;

				files.forEach((file, index) => {
					const chip = this.domBuilder.buildElement('div', { className: 'flex justify-between items-center bg-gray-800 border border-gray-600 rounded px-3 py-2' });

					const left = this.domBuilder.buildElement('div', { className: 'flex items-center gap-2 overflow-hidden' });
					let iconClass = file.type.startsWith('image/') ? 'fa-image text-purple-400' : 'fa-file-pdf text-red-400';
					left.innerHTML = `<i class="fas ${iconClass}"></i> <span class="text-sm text-gray-300 truncate">${file.name}</span>`;

					// Click para visualizar
					const viewBtn = this.domBuilder.buildElement('button', { className: 'text-xs text-indigo-400 hover:text-indigo-300 mr-2', text: 'Ver' });
					viewBtn.onclick = (e) => {
						e.preventDefault();
						const w = window.open("");
						if (file.type.startsWith('image/')) w.document.write(`<img src="${file.data}" style="max-width:100%">`);
						else w.document.write(`<iframe src="${file.data}" style="width:100%;height:100%;border:0"></iframe>`);
					};

					const delBtn = this.domBuilder.buildElement('button', { className: 'text-gray-500 hover:text-red-400', html: '<i class="fas fa-times"></i>' });
					delBtn.onclick = (e) => {
						e.preventDefault();
						if (confirm('Remover este arquivo?')) this.handleRemoveContractAttachment(contractId, index);
					};

					const actions = this.domBuilder.buildElement('div');
					actions.append(viewBtn, delBtn);

					chip.append(left, actions);
					container.append(chip);
				});
			}

			// [INÍCIO DA ALTERAÇÃO - CONTRATO ESPECIAL]
			// Lógica de Edição de Contrato ATUALIZADA
			openContractModal(contractId = null) {
				try {
					const form = document.getElementById('formContrato'); form.reset();
					document.getElementById('financialDataChanged').value = 'false';
					const title = document.getElementById('modalContratoTitle');
					const servicosContainer = document.getElementById('servicosContainer'); servicosContainer.innerHTML = '';

					// [NOVO v5.8] Inicializa Lógica de Arquivos do Contrato
					this.contractAttachmentsQueue = [];
					this.renderContractAttachmentsList([], null);

					const dropZone = document.getElementById('contractFilesDropZone');
					const fileInput = document.getElementById('contractFileInput');

					// Setup Click no DropZone para abrir Input
					dropZone.onclick = (e) => {
						if (e.target !== fileInput) fileInput.click();
					};
					// Setup Input Change
					fileInput.onchange = (e) => {
						if (e.target.files[0]) this.handleContractFileUpload(document.getElementById('contractId').value, e.target.files[0]);
					};
					// Setup Drag and Drop
					Utils.setupDragAndDrop(dropZone, (file) => {
						this.handleContractFileUpload(document.getElementById('contractId').value, file);
					});

					// [INÍCIO DA ALTERAÇÃO - OFICINA]
					// Esta função agora popula o modal com a lista do Firebase
					this.populateAdvogadoSelectModal();
					// [FIM DA ALTERAÇÃO - OFICINA]

					const advogadoSelect = document.getElementById('advogadoResponsavel');

					// Reseta o estado das parcelas manuais
					this.manualParcels = [];
					this.renderManualParcelList();

					// [NOVO v5.6] Referências aos campos financeiros e aviso
					const financialWarning = document.getElementById('financial-warning');
					const financialFieldsDiv = document.getElementById('financial-fields-standard');
					const financialInputs = financialFieldsDiv.querySelectorAll('input, select');

					const specialCheckbox = document.getElementById('contratoEspecial');
					const standardFields = document.getElementById('financial-fields-standard');
					const specialFields = document.getElementById('financial-fields-special');

					if (contractId) {
						// --- MODO DE EDIÇÃO ---
						const contract = this.database.contracts.find(c => c.id === contractId);
						if (!contract) { Utils.showToast('Contrato não encontrado.', 'error'); return; }
						title.textContent = "Editar Contrato";
						document.getElementById('contractId').value = contract.id;
						document.getElementById('clienteNome').value = contract.clientName;
						document.getElementById('clienteContato').value = contract.clientContact || '';
						advogadoSelect.value = contract.advogadoResponsavel;
						(contract.serviceTypes || []).forEach(service => this.createServiceTag(service.name, service.deadline, service.status));
						document.getElementById('contratoTipoPagamento').value = contract.paymentType || 'Parcelado';
						document.getElementById('contratoObservacoes').value = contract.observations || '';

						// [NOVO v5.8] Renderiza Arquivos do Contrato
						this.renderContractAttachmentsList(contract.contractAttachments || [], contract.id);

						// Verifica se alguma parcela foi paga
						const hasPaidParcels = (contract.parcels || []).some(p => p.status === 'Paga');

						if (hasPaidParcels && this.isUserAdmin) {
							// Se já pagou, BLOQUEIA os campos financeiros
							financialWarning.classList.remove('hidden');
							financialFieldsDiv.classList.add('hidden'); // Esconde os campos padrão
							specialFields.classList.add('hidden'); // Esconde os campos especiais
							specialCheckbox.disabled = true; // Desativa a checkbox
							financialInputs.forEach(input => input.disabled = true);

							// [NOVO] Renderiza lista de Parcelas Pagas para Anexos
							const paidContainer = document.getElementById('paid-parcels-container');
							const paidList = document.getElementById('paid-parcels-list');
							paidContainer.classList.remove('hidden');
							paidList.innerHTML = '';

							(contract.parcels || []).forEach((p, pIndex) => {
								if (p.status === 'Paga') {
									const row = this.domBuilder.buildElement('div', { className: 'bg-gray-700/50 p-3 rounded border border-gray-600' });

									// Info da Parcela
									const info = this.domBuilder.buildElement('div', { className: 'flex justify-between text-sm text-gray-300 mb-2' });
									info.innerHTML = `<span><strong>Parcela ${p.number}</strong> (Pago: ${Utils.formatCurrency(p.valuePaid)})</span> <span class="text-xs text-gray-400">${Utils.formatDate(p.paymentDate)}</span>`;
									row.appendChild(info);

									// Seção de Anexos (Cópia simplificada da lógica do Card)
									const attDiv = this.domBuilder.buildElement('div', { className: 'border-t border-gray-600 pt-2' });

									// Botão Add
									const attHeader = this.domBuilder.buildElement('div', { className: 'flex justify-between items-center mb-1' });
									const uploadLabel = this.domBuilder.buildElement('label', {
										className: 'cursor-pointer text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1',
										html: '<i class="fas fa-plus-circle"></i> Anexar documento'
									});
									const fInput = this.domBuilder.buildElement('input', { className: 'hidden', type: 'file', accept: 'image/*,application/pdf' });
									fInput.onchange = (e) => {
										if (e.target.files[0]) this.handleFileUpload(contract.id, pIndex, e.target.files[0]);
									};
									uploadLabel.appendChild(fInput);
									attHeader.appendChild(uploadLabel);
									attDiv.appendChild(attHeader);

									// Lista
									const chips = this.domBuilder.buildElement('div', { className: 'flex flex-wrap gap-2' });
									if (p.attachments && p.attachments.length > 0) {
										p.attachments.forEach((att, attIdx) => {
											const chip = this.domBuilder.buildElement('div', { className: 'bg-gray-800 text-xs px-2 py-1 rounded flex items-center gap-2 border border-gray-600' });

											const nameSpan = this.domBuilder.buildElement('span', { className: 'cursor-pointer hover:text-indigo-400', text: att.name });
											nameSpan.onclick = () => {
												const w = window.open("");
												if (att.type.startsWith('image/')) w.document.write(`<img src="${att.data}" style="max-width:100%">`);
												else w.document.write(`<iframe src="${att.data}" style="width:100%;height:100%;border:0"></iframe>`);
											};

											const delIcon = this.domBuilder.buildElement('i', { className: 'fas fa-times text-red-400 cursor-pointer pl-1' });
											delIcon.onclick = () => {
												if (confirm('Remover anexo?')) this.handleRemoveAttachment(contract.id, pIndex, attIdx);
											};

											chip.appendChild(nameSpan);
											chip.appendChild(delIcon);
											chips.appendChild(chip);
										});
									}
									attDiv.appendChild(chips);
									row.appendChild(attDiv);
									paidList.appendChild(row);
								}
							});

						} else {
							// Se não pagou, permite a edição (e reseta os campos)
							financialWarning.classList.add('hidden');
							document.getElementById('paid-parcels-container').classList.add('hidden'); // Escondecontainer
							specialCheckbox.disabled = !this.isUserAdmin;
							financialInputs.forEach(input => input.disabled = !this.isUserAdmin);
						}

						// Preenche os campos financeiros (mesmo que estejam escondidos/bloqueados)
						if (this.isUserAdmin) {
							document.getElementById('taxaExito').value = contract.successFee || '';

							// Define o estado do modal (Especial vs Padrão)
							specialCheckbox.checked = contract.isSpecialContract || false;

							if (contract.isSpecialContract) {
								// É um contrato especial, preenche a lista manual
								standardFields.style.display = 'none';
								specialFields.style.display = 'block';
								this.manualParcels = (contract.parcels || []).map(p => ({
									value: p.value,
									dueDate: p.dueDate.split('T')[0] // Formato YYYY-MM-DD
								}));
								this.renderManualParcelList();
							} else {
								// É um contrato padrão, preenche os campos padrão
								standardFields.style.display = 'block';
								specialFields.style.display = 'none';
								document.getElementById('valorTotal').value = contract.totalValue || '';
								document.getElementById('numParcelas').value = (contract.parcels || []).length || 1;
								if ((contract.parcels || []).length > 0) {
									document.getElementById('vencimentoPrimeiraParcela').value = contract.parcels[0].dueDate.split('T')[0];
								}
							}
						}
						document.getElementById('contratoJaQuitado').checked = false;
						document.getElementById('contratoJaQuitado').disabled = hasPaidParcels;

					} else {
						// --- MODO DE CRIAÇÃO ---
						title.textContent = "Registar Novo Contrato";
						document.getElementById('contractId').value = '';
						advogadoSelect.value = this.isUserAdmin ? 'Não Informado' : this.currentUserDisplayName;

						// Garante que os campos estão visíveis e habilitados
						financialWarning.classList.add('hidden');
						document.getElementById('paid-parcels-container').classList.add('hidden'); // [NOVO] Garante escondido
						financialInputs.forEach(input => input.disabled = !this.isUserAdmin);
						document.getElementById('contratoJaQuitado').checked = false;

						// Reseta para o modo Padrão
						specialCheckbox.checked = false;
						specialCheckbox.disabled = !this.isUserAdmin;
						standardFields.style.display = 'block';
						specialFields.style.display = 'none';
					}

					this.openModal('modalContrato');
				} catch (e) {
					console.error('Erro em openContractModal:', e);
					Utils.showToast('Falha ao abrir o modal de contrato.', 'error');
				}
			}
			// [FIM DA ALTERAÇÃO]

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Removida a verificação 'isUserAdmin' para exibir valores
			openPaymentModal(contractId, parcelIndex) {
				const contract = this.database.contracts.find(c => c.id === contractId);
				if (!contract || !contract.parcels || !contract.parcels[parcelIndex]) return;
				const parcel = contract.parcels[parcelIndex];

				let valorCorrigido = parcel.value;
				let infoCorrecao = '';
				if (new Date(parcel.dueDate) < new Date()) {
					// [NOVO v5.5] Cálculo síncrono
					valorCorrigido = this.correctionCalculator.calcularValorCorrigido(parcel.value, parcel.dueDate);
					infoCorrecao = `<p class="text-red-400"><strong>Valor Corrigido:</strong> ${Utils.formatCurrency(valorCorrigido)}</p>`;
				}

				document.getElementById('pagamentoContractId').value = contractId;
				document.getElementById('pagamentoParcelIndex').value = parcelIndex;
				const infoDiv = document.getElementById('pagamentoInfo');
				infoDiv.innerHTML = `
					<p><strong>Cliente:</strong> ${contract.clientName}</p>
					<p><strong>Parcela:</strong> ${parcel.number}/${contract.parcels.length}</p>
					<p><strong>Valor Original:</strong> ${Utils.formatCurrency(parcel.value)}</p>
					${infoCorrecao}`;

				const valorInput = document.getElementById('pagamentoValor');
				// Define o valor, mas só permite edição se for admin
				valorInput.value = valorCorrigido.toFixed(2);
				valorInput.disabled = !this.isUserAdmin;

				// [NOVO] Limpa o campo de anexo e Configura Drag&Drop
				const anexoInput = document.getElementById('pagamentoAnexo');
				if (anexoInput) {
					anexoInput.value = '';

					// Adiciona classes para efeito visual de "Drop Zone"
					const dropContainer = anexoInput.parentElement;
					dropContainer.classList.add('border', 'border-transparent', 'rounded-md', 'transition-colors', 'duration-200');

					Utils.setupDragAndDrop(dropContainer, (file) => {
						// Cria um FileList simulado para atribuir ao input
						const dt = new DataTransfer();
						dt.items.add(file);
						anexoInput.files = dt.files;
						Utils.showToast(`Arquivo "${file.name}" selecionado!`, 'info');
					});
				}

				document.getElementById('pagamentoData').value = new Date().toISOString().split('T')[0];
				this.openModal('modalPagamento');
			}

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Removida a verificação 'isUserAdmin' para exibir valores
			openClientHistoryModal(clientName) {
				const clientContracts = (this.isUserAdmin ? this.database.contracts : this.getFilteredContracts(true))
					.filter(c => c.clientName === clientName);
				const title = document.getElementById('clienteModalTitle'); title.textContent = `Histórico de ${clientName}`;
				const content = document.getElementById('clienteModalContent'); content.innerHTML = '';

				let totalContratado = 0, totalPago = 0;
				const fragment = document.createDocumentFragment();

				clientContracts.forEach(contract => {
					const contractValue = contract.totalValue || 0;
					totalContratado += contractValue;

					let contractHtml = `<div class="bg-gray-700 p-4 rounded-lg ${contract.isDeleted ? 'opacity-60 border-l-4 border-gray-500' : ''}">`;
					contractHtml += `<div class="flex justify-between items-start">
						<h3 class="font-bold text-lg text-white">${(contract.serviceTypes || []).map(s => s.name).join(', ')} <span class="text-base font-normal text-gray-400">- ${contract.paymentType || ''}</span></h3>
						${contract.isDeleted ? '<span class="text-xs bg-red-900/50 text-red-300 px-2 py-1 rounded-full font-semibold">Excluído</span>' : ''}
					</div>`;
					contractHtml += `<p class="text-sm text-gray-400 mb-2">Adv: ${contract.advogadoResponsavel}</p>`;
					if (contract.observations) contractHtml += `<blockquote class="text-sm mt-2 p-2 bg-gray-600/50 rounded-md text-gray-300 border-l-4 border-indigo-500 pl-4"><strong>Obs:</strong> ${Utils.sanitizeText(contract.observations)}</blockquote>`;

					if ((contract.parcels || []).length > 0) {
						contractHtml += `<ul class="mt-2 text-sm space-y-1">`;
						contract.parcels.forEach(p => {
							const statusClass = p.status === 'Paga' ? 'text-green-400' : 'text-red-400';
							let valorPagoDisplay = '';
							if (p.status === 'Paga') {
								totalPago += p.valuePaid || 0;
								valorPagoDisplay = `(pago ${Utils.formatCurrency(p.valuePaid || 0)})`;
							}
							const valorParcelaDisplay = Utils.formatCurrency(p.value);
							contractHtml += `<li>Parcela ${p.number} - ${valorParcelaDisplay} - <span class="${statusClass}">${p.status}</span> ${valorPagoDisplay}</li>`;
						});
						contractHtml += `</ul>`;
					}
					if (contract.successFeePaymentDate) {
						const exitoRecebidoDisplay = Utils.formatCurrency(contract.successFeeValueReceived);
						totalPago += contract.successFeeValueReceived || 0;
						contractHtml += `<p class="mt-2 text-sm text-green-400">Êxito Recebido: ${exitoRecebidoDisplay}</p>`;
					}
					contractHtml += `</div>`;

					const el = this.domBuilder.buildElement('div');
					el.innerHTML = contractHtml;
					fragment.append(el);
				});

				// O sumário agora é mostrado para todos
				const summaryHtml = `
				<div class="grid grid-cols-3 gap-4 text-center">
					<div><p class="text-sm text-gray-400">Total Contratado</p><p class="font-bold text-lg text-white">${Utils.formatCurrency(totalContratado)}</p></div>
					<div><p class="text-sm text-gray-400">Total Pago</p><p class="font-bold text-lg text-green-400">${Utils.formatCurrency(totalPago)}</p></div>
					<div><p class="text-sm text-gray-400">Saldo Devedor</p><p class="font-bold text-lg text-red-400">${Utils.formatCurrency(totalContratado - totalPago)}</p></div>
				</div><hr class="my-4 border-gray-700">`;
				const summaryEl = this.domBuilder.buildElement('div');
				summaryEl.innerHTML = summaryHtml;
				content.append(summaryEl);

				content.append(fragment);
				this.openModal('modalCliente');
			}

			// Modal de Relatório Antigo
			openReportModal() {
				if (!this.isUserAdmin) { Utils.showToast('Apenas admins podem abrir o relatório.', 'error'); return; }
				this.openModal('modalRelatorio');
				try {
					this._populateDateSelectors();
					this.generateAndShowReport();
				} catch (e) {
					console.error("Erro ao gerar relatório:", e);
					Utils.showToast('Não foi possível gerar o relatório.', 'error');
				}
			}

			_populateDateSelectors() {
				const monthSelect = document.getElementById('reportMonth');
				const yearSelect = document.getElementById('reportYear');
				if (monthSelect.options.length > 0) return;
				const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
				const anoAtual = new Date().getFullYear();
				meses.forEach((mes, index) => { monthSelect.add(new Option(mes, index)); });
				for (let i = anoAtual; i >= anoAtual - 5; i--) { yearSelect.add(new Option(i, i)); }
				monthSelect.value = new Date().getMonth(); yearSelect.value = anoAtual;
			}

			generateAndShowReport() {
				if (!this.isUserAdmin) return;
				document.getElementById('reportChartsContainer').classList.add('hidden');
				const resultDiv = document.getElementById('reportResult');
				resultDiv.classList.remove('hidden');

				const month = parseInt(document.getElementById('reportMonth').value);
				const year = parseInt(document.getElementById('reportYear').value);
				// [INÍCIO DA ALTERAÇÃO] Passa os contratos filtrados para o report handler
				const income = this.reportHandler.calculateMonthlyIncome(year, month, this.getFilteredContracts(true));
				// [FIM DA ALTERAÇÃO]

				let detailsHtml = '<h4 class="text-lg font-semibold mt-6 border-t border-gray-700 pt-4 text-white">Detalhes dos Recebimentos</h4>';
				if (income.detailedPayments.length > 0) {
					detailsHtml += '<ul class="space-y-2 mt-2 text-sm">';
					income.detailedPayments.forEach(p => {
						detailsHtml += `<li class="flex justify-between items-center bg-gray-700/50 p-3 rounded-md"><div><p class="font-semibold text-white">${p.clientName}</p><p class="text-xs text-gray-400">${p.type} - ${Utils.formatDate(p.date)}</p></div><span class="font-semibold text-green-400 text-lg">${Utils.formatCurrency(p.value)}</span></li>`;
					});
					detailsHtml += '</ul>';
				} else {
					detailsHtml += '<p class="text-sm text-gray-400 mt-2">Nenhum recebimento neste período.</p>';
				}
				// [NOVO] HTML dos Inadimplentes
				const defaulters = this.reportHandler.getDefaultersInMonth(month, year, this.getFilteredContracts(true));
				let defaultersHtml = '<h4 class="text-lg font-semibold mt-6 border-t border-gray-700 pt-4 text-red-400">Inadimplentes (Vencidos no Mês)</h4>';

				if (defaulters.length > 0) {
					defaultersHtml += '<ul class="space-y-2 mt-2 text-sm">';
					defaulters.forEach(d => {
						defaultersHtml += `<li class="flex justify-between items-center bg-red-900/20 p-2 rounded border border-red-900/50">
							<div><span class="font-bold text-gray-200">${d.client}</span> <span class="text-xs text-gray-400">(${d.advogado})</span><br><span class="text-xs text-red-300">Venceu: ${Utils.formatDate(d.dueDate)}</span></div>
							<span class="font-bold text-red-400">${Utils.formatCurrency(d.value)}</span>
						</li>`;
					});
					defaultersHtml += '</ul>';
				} else {
					defaultersHtml += '<p class="text-sm text-gray-500 mt-2">Nenhum atraso registado.</p>';
				}

				resultDiv.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="dark-card shadow-lg p-4 rounded-lg text-center">
                    <p class="text-sm text-gray-400">Total (Parcelas)</p>
                    <p class="text-2xl font-bold text-white">${Utils.formatCurrency(income.totalParcelas)}</p>
                </div>
                <div class="dark-card shadow-lg p-4 rounded-lg text-center">
                    <p class="text-sm text-gray-400">Total (Êxito)</p>
                    <p class="text-2xl font-bold text-indigo-400">${Utils.formatCurrency(income.totalExito)}</p>
                </div>
            </div>
            <div class="bg-gray-900 p-4 rounded-lg border border-gray-700 text-center mt-4">
                <p class="text-white font-bold">TOTAL GERAL RECEBIDO</p>
                <p class="text-3xl font-extrabold text-green-400">${Utils.formatCurrency(income.totalGeral)}</p>
            </div>
        ` + detailsHtml + defaultersHtml;
			}

			showAnalyticsInModal() {
				if (!this.isUserAdmin) return;
				document.getElementById('reportResult').classList.add('hidden');
				document.getElementById('reportChartsContainer').classList.remove('hidden');

				try {
					const actualCtx = document.getElementById('actualIncomeChartModal')?.getContext('2d');
					const projectedCtx = document.getElementById('projectedIncomeChartModal')?.getContext('2d');
					if (!actualCtx || !projectedCtx) return;

					const allContracts = this.getFilteredContracts(true);
					const actualData = this.reportHandler.getActualIncomeData(allContracts);
					this.analyticsHandler.renderActualIncomeChart(actualCtx, actualData.labels, actualData.data);

					const projectedData = this.reportHandler.getProjectedIncomeData(allContracts);
					this.analyticsHandler.renderProjectedIncomeChart(projectedCtx, projectedData.labels, projectedData.data);
				} catch (e) {
					console.error('Erro ao renderizar gráficos:', e);
					Utils.showToast('Erro ao carregar gráficos.', 'error');
				}
			}

			// [INÍCIO DA ALTERAÇÃO - ADVOGADO VÊ FINANCEIRO]
			// Removida a verificação 'isUserAdmin' para exibir valores
			openExitoModal(contractId) {
				const contract = this.database.contracts.find(c => c.id === contractId); if (!contract) return;
				document.getElementById('exitoContractId').value = contractId;
				const exitoInfoEl = document.getElementById('exitoInfo');
				const valorRecebidoInput = document.getElementById('exitoValorRecebido');

				exitoInfoEl.innerHTML = `<p><strong>Cliente:</strong> ${contract.clientName}</p><p><strong>Serviço:</strong> ${(contract.serviceTypes || []).map(s => s.name).join(', ')}</p><p><strong>Bonificação Prevista:</strong> <span class="font-bold text-indigo-400">${contract.successFee}</span></p>`;

				valorRecebidoInput.value = '';
				// A lógica de esconder/mostrar o CAMPO DE EDIÇÃO permanece
				valorRecebidoInput.closest('.admin-only').style.display = this.isUserAdmin ? 'block' : 'none';
				document.querySelector('#modalExito .non-admin-hidden').style.display = this.isUserAdmin ? 'none' : 'block';

				this.openModal('modalExito');
			}
			// [FIM DA ALTERAÇÃO]

			createServiceTag(serviceName, deadline, status = 'Pendente') {
				const container = document.getElementById('servicosContainer');
				const tag = this.domBuilder.buildElement('div', { className: 'service-tag' });
				tag.dataset.name = serviceName;
				tag.dataset.deadline = deadline || '';
				tag.dataset.status = status;

				let deadlineHtml = '';
				if (deadline) {
					const prazo = new Date(deadline + "T12:00:00Z");
					deadlineHtml = `<span class="text-xs text-gray-400 ml-2">(${Utils.formatDate(prazo)})</span>`;
				}
				tag.innerHTML = `<span>${serviceName}${deadlineHtml}</span><span class="remove-tag" onclick="this.parentElement.remove()">&times;</span>`;
				container.appendChild(tag);
			}

			// --- 7. EXPORTAÇÃO, NOTIFICAÇÕES E RELATÓRIOS (v5) ---

			// [MUDANÇA v5] Lógica do Dropdown de Notificação
			renderNotificationDropdown() {
				const notifications = this.database.notifications;
				this.notificationList.innerHTML = '';

				const unread = notifications.filter(n => !n.isRead);
				if (unread.length > 0) {
					this.notificationBadge.classList.remove('hidden');
				} else {
					this.notificationBadge.classList.add('hidden');
				}

				if (notifications.length === 0) {
					this.notificationListEmpty.classList.remove('hidden');
					return;
				}

				this.notificationListEmpty.classList.add('hidden');
				const fragment = document.createDocumentFragment();
				notifications.forEach(n => {
					fragment.append(this.domBuilder.createNotificationItem(n));
				});
				this.notificationList.append(fragment);
			}

			async markNotificationsAsRead(ids = null) {
				const unreadIds = ids || this.database.notifications.filter(n => !n.isRead).map(n => n.id);
				if (unreadIds.length === 0) return;

				await this.firebaseService.markNotificationsAsRead(this.currentSafeName, unreadIds);
				// O listener vai atualizar a UI
			}

			closeNotificationDropdown() {
				if (this.notificationDropdown) {
					this.notificationDropdown.classList.add('hidden');
				}
			}

			// [MUDANÇA v5] Lógica dos Relatórios Avançados
			generateAdvancedReport() {
				// [CORREÇÃO v5.2] Destrói gráficos antigos ANTES de criar novos
				this.analyticsHandler.destroyPageCharts('page-relatorios');

				const startDate = new Date(document.getElementById('reportStartDate').value + 'T00:00:00-04:00'); // Fuso de RO
				const endDate = new Date(document.getElementById('reportEndDate').value + 'T23:59:59-04:00'); // Fuso de RO

				if (endDate < startDate) {
					Utils.showToast('Data final deve ser maior que a data inicial.', 'error');
					return;
				}

				const contracts = this.getFilteredContracts(true);
				const data = this.reportHandler.calculateIncomeByDateRange(startDate, endDate, contracts);
				this.currentAdvancedReportData = data; // Salva os dados para o PDF

				if (data.totalGeral === 0 && data.totalContratos === 0) {
					document.getElementById('advancedReportContainer').classList.add('hidden');
					document.getElementById('advancedReportEmpty').classList.remove('hidden');
					document.getElementById('exportPdfButton').disabled = true;
					return;
				}

				document.getElementById('advancedReportContainer').classList.remove('hidden');
				document.getElementById('advancedReportEmpty').classList.add('hidden');
				document.getElementById('exportPdfButton').disabled = false;

				// 1. Renderiza KPIs
				this.renderReportKPIs(data);
				// 2. Renderiza Gráficos
				this.renderAdvancedReportCharts(data);
			}

			renderReportKPIs(data) {
				const container = document.getElementById('report-kpis');
				// Grid ajustado para 5 colunas para caber o novo card
				container.className = "grid grid-cols-1 md:grid-cols-5 gap-4";
				container.innerHTML = `
					<div class="dark-card p-4 rounded-lg shadow-lg text-center border-l-4 border-green-500">
						<h3 class="text-xs font-semibold text-gray-400 uppercase">Faturação Total</h3>
						<p class="text-2xl font-bold text-green-400 mt-1">${Utils.formatCurrency(data.totalGeral)}</p>
					</div>
					<div class="dark-card p-4 rounded-lg shadow-lg text-center border-l-4 border-gray-600">
						<h3 class="text-xs font-semibold text-gray-400 uppercase">Parc. Recebidas</h3>
						<p class="text-xl font-bold text-white mt-1">${Utils.formatCurrency(data.totalParcelas)}</p>
					</div>
					<div class="dark-card p-4 rounded-lg shadow-lg text-center border-l-4 border-indigo-500">
						<h3 class="text-xs font-semibold text-gray-400 uppercase">Êxito Recebido</h3>
						<p class="text-xl font-bold text-indigo-400 mt-1">${Utils.formatCurrency(data.totalExito)}</p>
					</div>
					<div class="dark-card p-4 rounded-lg shadow-lg text-center border-l-4 border-red-500 bg-red-900/10">
						<h3 class="text-xs font-semibold text-red-300 uppercase">Total em Atraso</h3>
						<p class="text-xl font-bold text-red-500 mt-1">${Utils.formatCurrency(data.totalVencido)}</p>
					</div>
					<div class="dark-card p-4 rounded-lg shadow-lg text-center border-l-4 border-blue-500">
						<h3 class="text-xs font-semibold text-gray-400 uppercase">Novos Contratos</h3>
						<p class="text-xl font-bold text-blue-400 mt-1">${data.totalContratos}</p>
					</div>
				`;
			}

			renderAdvancedReportCharts(data) {
				// 1. Gráfico de Linha Comparativo (Recebido vs Vencido)
				const timelineCtx = document.getElementById('advReportTimelineChart').getContext('2d');

				// Junta meses de recebimento e de vencimento para o eixo X ficar correto
				const allMonths = new Set([...Object.keys(data.byMonth), ...Object.keys(data.vencidoByMonth)]);
				const sortedMonths = Array.from(allMonths).sort();

				const timelineLabels = sortedMonths.map(key => {
					const [year, month] = key.split('-');
					return new Date(year, month - 1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
				});

				const incomeData = sortedMonths.map(key => data.byMonth[key] || 0);
				const debtData = sortedMonths.map(key => data.vencidoByMonth[key] || 0);

				if (this.advReportTimelineChart) this.advReportTimelineChart.destroy();
				this.advReportTimelineChart = new Chart(timelineCtx, {
					type: 'line',
					data: {
						labels: timelineLabels,
						datasets: [
							{
								label: 'Recebido (Real)',
								data: incomeData,
								backgroundColor: 'rgba(74, 222, 128, 0.2)',
								borderColor: '#4ade80', // Verde
								borderWidth: 2,
								fill: true,
								tension: 0.3
							},
							{
								label: 'Não Pago (Dívida)',
								data: debtData,
								backgroundColor: 'rgba(239, 68, 68, 0.1)',
								borderColor: '#ef4444', // Vermelho
								borderWidth: 2,
								borderDash: [5, 5], // Linha tracejada
								fill: false,
								tension: 0.3
							}
						]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						scales: {
							y: { beginAtZero: true, ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
							x: { ticks: { color: '#9ca3af' }, grid: { display: false } }
						},
						plugins: {
							legend: { labels: { color: '#d1d5db' } },
							tooltip: { mode: 'index', intersect: false }
						}
					}
				});

				// 2. Gráfico de Pizza (Faturação por Advogado)
				const byAdvCtx = document.getElementById('advReportByAdvogadoChart').getContext('2d');
				const advLabels = Object.keys(data.byAdvogado);
				const advData = Object.values(data.byAdvogado);
				this.analyticsHandler.renderByAdvogadoChart(byAdvCtx, advLabels, advData);

				// 3. Gráfico de Barras (Novos Contratos)
				const newContractsCtx = document.getElementById('advReportNewContractsChart').getContext('2d');
				const sortedContractMonths = Object.keys(data.newContractsByMonth).sort();
				const contractLabels = sortedContractMonths.map(key => {
					const [year, month] = key.split('-');
					return new Date(year, month - 1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
				});
				const contractData = sortedContractMonths.map(key => data.newContractsByMonth[key]);
				this.analyticsHandler.renderNewContractsChart(newContractsCtx, contractLabels, contractData);

				// [NOVO] 5. Tabela de Novos Contratos (Solicitação do Usuário)
				try {
					let newContractsContainer = document.getElementById('advReportNewContractsTable');
					if (!newContractsContainer) {
						newContractsContainer = document.createElement('div');
						newContractsContainer.id = 'advReportNewContractsTable';
						newContractsContainer.className = 'dark-card shadow-lg p-6 rounded-lg mt-8 col-span-1 md:col-span-2 border-l-4 border-blue-500';
						// Tenta encontrar o container pai, fallback para o body se falhar (evita crash)
						const parent = document.getElementById('advancedReportContainer');
						if (parent) parent.appendChild(newContractsContainer);
						else console.error('Parent container advancedReportContainer not found!');
					}

					const startDate = new Date(document.getElementById('reportStartDate').value + 'T00:00:00');
					const endDate = new Date(document.getElementById('reportEndDate').value + 'T23:59:59');

					// Lógica de Novos Contratos
					const newContractsList = (this.getFilteredContracts ? this.getFilteredContracts(true) : []).filter(c => {
						const d = new Date(c.createdAt || '2020-01-01');
						return d >= startDate && d <= endDate;
					});

					let htmlNew = `<h3 class="text-lg font-semibold text-blue-400 mb-4">Novos Contratos no Período</h3>`;
					if (newContractsList.length === 0) {
						htmlNew += `<p class="text-gray-400">Nenhum novo contrato neste período.</p>`;
					} else {
						htmlNew += `<div class="overflow-x-auto"><table class="ranking-table"><thead><tr><th>Cliente</th><th>Advogado</th><th>Data Criação</th><th>Valor Fixo</th></tr></thead><tbody>`;
						newContractsList.forEach(c => {
							htmlNew += `<tr>
								<td class="text-white">${c.clientName}</td>
								<td class="text-gray-400">${c.advogadoResponsavel}</td>
								<td>${Utils.formatDate(c.createdAt)}</td>
								<td class="text-blue-400 font-bold">${Utils.formatCurrency(c.totalValue)}</td>
							</tr>`;
						});
						htmlNew += `</tbody></table></div>`;
					}
					if (newContractsContainer) newContractsContainer.innerHTML = htmlNew;

				} catch (err) {
					console.error("Erro ao renderizar tabela de novos contratos:", err);
				}

				// 4. Tabela de Inadimplentes (Com as aspas corrigidas!)
				let defContainer = document.getElementById('advReportDefaulters');
				if (!defContainer) {
					defContainer = document.createElement('div');
					defContainer.id = 'advReportDefaulters';
					defContainer.className = 'dark-card shadow-lg p-6 rounded-lg mt-8 col-span-1 md:col-span-2';
					document.getElementById('advancedReportContainer').appendChild(defContainer);
				}

				const startD = new Date(document.getElementById('reportStartDate').value + 'T00:00:00');
				const endD = new Date(document.getElementById('reportEndDate').value + 'T23:59:59');

				let htmlDef = `<h3 class="text-lg font-semibold text-red-400 mb-4">Inadimplência Detalhada no Período</h3>`;
				const allC = this.getFilteredContracts(true);
				const periodDefaulters = [];

				allC.forEach(c => {
					(c.parcels || []).forEach(p => {
						const d = new Date(p.dueDate);
						if (d >= startD && d <= endD && p.status === 'Pendente' && d < new Date()) {
							periodDefaulters.push({ client: c.clientName, date: d, value: p.value, adv: c.advogadoResponsavel });
						}
					});
				});

				if (periodDefaulters.length === 0) {
					htmlDef += `<p class="text-gray-400">Nenhum pagamento em atraso neste período.</p>`;
				} else {
					htmlDef += `<div class="overflow-x-auto"><table class="ranking-table"><thead><tr><th>Cliente</th><th>Advogado</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>`;
					periodDefaulters.forEach(d => {
						htmlDef += `<tr><td class="text-white">${d.client}</td><td class="text-gray-400">${d.adv}</td><td>${Utils.formatDate(d.date)}</td><td class="text-red-400 font-bold">${Utils.formatCurrency(d.value)}</td></tr>`;
					});
					htmlDef += `</tbody></table></div>`;
				}
				defContainer.innerHTML = htmlDef;
			}
			exportReportPDF() {
				if (!this.currentAdvancedReportData) {
					Utils.showToast('Gere um relatório primeiro.', 'error');
					return;
				}

				const data = this.currentAdvancedReportData;
				const { jsPDF } = window.jspdf;
				const doc = new jsPDF();
				const startDate = new Date(document.getElementById('reportStartDate').value + 'T12:00:00Z');
				const endDate = new Date(document.getElementById('reportEndDate').value + 'T12:00:00Z');

				doc.setFontSize(18);
				doc.text("Relatório Financeiro Avançado", 14, 22);

				doc.setFontSize(11);
				doc.text(`Período: ${Utils.formatDate(startDate)} a ${Utils.formatDate(endDate)}`, 14, 30);

				doc.setFontSize(16);
				doc.text("Resumo Financeiro", 14, 45);
				doc.autoTable({
					startY: 50,
					head: [['Métrica', 'Valor']],
					body: [
						['Faturação Total', Utils.formatCurrency(data.totalGeral)],
						['Total Recebido (Parcelas)', Utils.formatCurrency(data.totalParcelas)],
						['Total Recebido (Êxito)', Utils.formatCurrency(data.totalExito)],
						['Novos Contratos no Período', data.totalContratos],
					],
					theme: 'grid',
					headStyles: { fillColor: [79, 70, 229] } // Índigo
				});

				doc.addPage();
				doc.setFontSize(16);
				doc.text("Faturação por Advogado", 14, 22);
				const advData = Object.entries(data.byAdvogado)
					.sort(([, a], [, b]) => b - a)
					.map(([adv, valor]) => [adv, Utils.formatCurrency(valor)]);

				doc.autoTable({
					startY: 28,
					head: [['Advogado(a)', 'Valor Faturado']],
					body: advData,
					theme: 'grid',
					headStyles: { fillColor: [79, 70, 229] }
				});

				doc.setFontSize(16);
				doc.text("Detalhes dos Recebimentos", 14, doc.autoTable.previous.finalY + 15);
				const paymentData = data.detailedPayments.map(p => [
					p.clientName,
					p.type,
					Utils.formatDate(p.date),
					p.advogado,
					Utils.formatCurrency(p.value)
				]);

				doc.autoTable({
					startY: doc.autoTable.previous.finalY + 21,
					head: [['Cliente', 'Tipo', 'Data', 'Advogado', 'Valor']],
					body: paymentData,
					theme: 'striped',
					headStyles: { fillColor: [79, 70, 229] }
				});

				doc.save(`Relatorio_FG_${startDate.toISOString().split('T')[0]}_a_${endDate.toISOString().split('T')[0]}.pdf`);
			}

			// ================== COLE O CÓDIGO NOVO AQUI ==================
			exportDefaultersPDF() {
				const startVal = document.getElementById('reportStartDate').value;
				const endVal = document.getElementById('reportEndDate').value;

				if (!startVal || !endVal) {
					Utils.showToast('Por favor, selecione as datas de início e fim.', 'error');
					return;
				}

				const startDate = new Date(startVal + 'T00:00:00');
				const endDate = new Date(endVal + 'T23:59:59');
				const hoje = new Date();

				const contracts = this.getFilteredContracts(true);
				const defaulters = [];

				contracts.forEach(c => {
					if (!c.parcels) return;
					c.parcels.forEach(p => {
						const dueDate = new Date(p.dueDate);
						if (p.status === 'Pendente' && dueDate < hoje && dueDate >= startDate && dueDate <= endDate) {
							const corrected = this.correctionCalculator.calcularValorCorrigido(p.value, p.dueDate);

							defaulters.push({
								client: c.clientName,
								adv: c.advogadoResponsavel || 'N/A',
								date: dueDate,
								valueOriginal: p.value,
								valueCorrected: corrected,
								parcelNum: `${p.number}/${c.parcels.length}`
							});
						}
					});
				});

				if (defaulters.length === 0) {
					Utils.showToast('Nenhuma inadimplência encontrada neste período.', 'info');
					return;
				}

				defaulters.sort((a, b) => a.date - b.date);

				const { jsPDF } = window.jspdf;
				const doc = new jsPDF();

				doc.setFontSize(18);
				doc.setTextColor(220, 38, 38);
				doc.text("Relatório de Inadimplência", 14, 22);

				doc.setFontSize(10);
				doc.setTextColor(100);
				doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
				doc.text(`Filtro: ${Utils.formatDate(startDate)} até ${Utils.formatDate(endDate)}`, 14, 33);

				const tableBody = defaulters.map(d => [
					d.client,
					d.adv,
					d.parcelNum,
					Utils.formatDate(d.date),
					Utils.formatCurrency(d.valueOriginal),
					Utils.formatCurrency(d.valueCorrected)
				]);

				const totalOriginal = defaulters.reduce((acc, cur) => acc + cur.valueOriginal, 0);
				const totalCorrected = defaulters.reduce((acc, cur) => acc + cur.valueCorrected, 0);

				doc.autoTable({
					startY: 40,
					head: [['Cliente', 'Advogado', 'Parc.', 'Vencimento', 'Valor Orig.', 'Valor Corr.']],
					body: tableBody,
					theme: 'striped',
					headStyles: { fillColor: [185, 28, 28] },
					styles: { fontSize: 9 },
					columnStyles: {
						4: { halign: 'right' },
						5: { halign: 'right', fontStyle: 'bold' }
					}
				});

				const finalY = doc.lastAutoTable.finalY + 10;

				doc.setFontSize(11);
				doc.setTextColor(0);
				doc.text(`Total Original: ${Utils.formatCurrency(totalOriginal)}`, 14, finalY);

				doc.setFontSize(12);
				doc.setTextColor(220, 38, 38);
				doc.setFont(undefined, 'bold');
				doc.text(`Total Corrigido (Dívida Real): ${Utils.formatCurrency(totalCorrected)}`, 14, finalY + 7);

				doc.save(`Inadimplentes_${startVal}_a_${endVal}.pdf`);
				Utils.showToast('PDF de Inadimplentes gerado!', 'success');
			}
			// ================== FIM DO CÓDIGO NOVO ==================
			// ...
			// Fim Mudança v5

			_formatCSVCell(data) {
				if (data == null) return '';
				let s = String(data);
				if (s.includes(',') || s.includes('"') || s.includes('\n')) {
					s = s.replace(/"/g, '""');
					return `"${s}"`;
				}
			}

			_downloadCSV(csvContent, filename) {
				const b = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
				const l = document.createElement("a");
				const u = URL.createObjectURL(b);
				l.href = u;
				l.download = filename;
				l.style.visibility = 'hidden';
				document.body.appendChild(l);
				l.click();
				document.body.removeChild(l);
			}

			exportContractsCSV() {
				const headers = ["ID", "Cliente", "Advogado", "Tipo Pagamento", "Valor Total", "Taxa Êxito", "Status", "Serviços", "Observações"];
				let csvRows = [headers.join(',')];
				this.getFilteredContracts(false).forEach(c => {
					const status = this.getContractStatus(c).statusText;
					const services = (c.serviceTypes || []).map(s => s.name).join('; ');
					const row = [
						c.id, c.clientName, c.advogadoResponsavel, c.paymentType || '',
						// [INÍCIO DA ALTERAÇÃO] Removida verificação 'isUserAdmin'
						c.totalValue, c.successFee,
						// [FIM DA ALTERAÇÃO]
						status, services, c.observations || ''
					].map(this._formatCSVCell).join(',');
					csvRows.push(row);
				});
				this._downloadCSV(csvRows.join('\n'), 'contratos_export.csv');
			}

			exportReportCSV() {
				if (!this.isUserAdmin) return;
				const month = parseInt(document.getElementById('reportMonth').value);
				const year = parseInt(document.getElementById('reportYear').value);
				const income = this.reportHandler.calculateMonthlyIncome(year, month, this.getFilteredContracts(true));

				if (income.detailedPayments.length === 0) { Utils.showToast("Nenhum dado para exportar.", "info"); return; }

				const headers = ["Cliente", "Tipo", "Data", "Valor"];
				let csvRows = [headers.join(',')];
				income.detailedPayments.forEach(p => {
					const row = [p.clientName, p.type, Utils.formatDate(p.date), p.value].map(this._formatCSVCell).join(',');
					csvRows.push(row);
				});
				const monthName = document.getElementById('reportMonth').options[month].text;
				this._downloadCSV(csvRows.join('\n'), `relatorio_${monthName}_${year}.csv`);
			}

			async recalculateAllDebts(referenceDate = new Date()) {
				if (!this.isUserAdmin) { Utils.showToast('Ação não permitida.', 'error'); return; }
				Utils.showToast('A iniciar recálculo... Isto pode demorar um momento.', 'info');
				const contracts = this.database.contracts.filter(c => !c.isDeleted);
				for (const contract of contracts) {
					if (!contract.parcels) continue;
					const updatedParcels = [...contract.parcels];
					let hasChanged = false;
					for (let p of updatedParcels) {
						if (p.status === 'Pendente') {
							// [NOVO v5.5] Recálculo agora é síncrono
							const updated = this.correctionCalculator.calcularValorCorrigido(p.value, p.dueDate, referenceDate);
							p.correctedValue = updated; // Armazena o valor corrigido
							hasChanged = true;
						}
					}
					if (hasChanged) {
						await this.firebaseService.updateContractField(contract.id, { parcels: updatedParcels });
					}
				}
				Utils.showToast('Recálculo concluído.', 'success');
			}

			// --- 8. HELPERS DE ACESSIBILIDADE E LAYOUT ---

			_setupModalAccessibility() {
				document.addEventListener('keydown', this._handleKeyDown.bind(this));
			}

			_handleKeyDown(event) {
				if (event.key === 'Escape') {
					if (this.openModalId && this.openModalId !== 'modalDisplayName') {
						this.closeModal(this.openModalId);
					}
					// [REVOLUÇÃO] Fecha a sidebar com Esc
					const sidebar = document.getElementById('sidebar');
					if (window.innerWidth < 768 && !sidebar.classList.contains('hidden')) {
						sidebar.classList.add('hidden');
						this.backdrop.style.display = 'none';
					}
					// [MUDANÇA v5] Fecha o dropdown de notificação com Esc
					this.closeNotificationDropdown();
				}

				if (event.key === 'Tab' && this.openModalId) {
					this._trapFocus(event);
				}
			}

			_trapFocus(event) {
				const modal = document.getElementById(this.openModalId);
				if (!modal) return;

				const focusableElements = modal.querySelectorAll(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				);
				if (focusableElements.length === 0) return;

				const firstElement = focusableElements[0];
				const lastElement = focusableElements[focusableElements.length - 1];

				if (event.shiftKey) {
					if (document.activeElement === firstElement) {
						lastElement.focus();
						event.preventDefault();
					}
				} else {
					if (document.activeElement === lastElement) {
						firstElement.focus();
						event.preventDefault();
					}
				}

				if (!modal.contains(document.activeElement)) {
					firstElement.focus();
				}
			}
		}

		// --- INICIALIZAÇÃO DA APLICAÇÃO ---
		document.addEventListener('DOMContentLoaded', () => {
			// [MUDANÇA v5] Garante que o jspdf-autotable está carregado
			// (Numa app real, isto seria feito com um bundler, mas aqui garantimos a ordem)
			const autoTableScript = document.createElement('script');
			autoTableScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
			autoTableScript.onload = () => {
				window.App = new App();
				window.App.initialize();

				// [AI AGENT INITIALIZATION]
				if (window.aiAgent) {
					window.aiAgent.init();
				}
			};
			autoTableScript.onerror = () => {
				document.getElementById('loading-overlay').textContent = "Erro ao carregar dependência (AutoTable).";
			};
			document.head.appendChild(autoTableScript);
		});