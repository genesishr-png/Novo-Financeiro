import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { Utils } from './utils.js';
import { CorrectionCalculator } from './correction-calculator.js';
import { AuthService } from './auth-service.js';
import { FirebaseService } from './firebase-service.js';
import { AnalyticsHandler } from './analytics-handler.js';
import { ReportHandler } from './report-handler.js';
import { DOMBuilder } from './dom-builder.js';

const ADMIN_USERS = ["dra. renata fabris", "Darc", "dr. felipe gurjão", "lilian"];
const CONTRACTS_PER_PAGE = 12;

class App {
			constructor() {
				// Estado da Aplicação
				this.database = {
					contracts: [],
					notifications: [], // [MUDANÇA v5]
					officeExpenses: [], // [NOVO]
					extraRevenues: [], // [FIX] Inicializado aqui para evitar crash
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
				this.lastExpensesCheck = null; // [NOVO]

				// [INÍCIO DA ALTERAÇÃO - CONTRATO ESPECIAL]
				this.manualParcels = []; // Array temporário para guardar parcelas manuais
				// [FIM DA ALTERAÇÃO]

				// Estado de UI
				this.viewMode = 'cliente'; // [NOVO] 'cliente' | 'escritorio'
				this.currentContractSort = 'name-asc';
				this.currentParcelasSort = 'days-asc'; // [MUDANÇA v5.6] Renomeado e mudou o padrão
				this.currentServicosSort = 'name-asc';
				this.contractListPage = 0;
				this.contractStatusFilter = 'ativos';

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

				// [FIX] Garante que todos os modais iniciem fechados (evita bug de cache/hydration)
				document.querySelectorAll('.modal').forEach(m => { m.style.display = 'none'; });
				if (this.backdrop) this.backdrop.style.display = 'none';
				document.body.style.overflow = '';
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
				const formDespesa = document.getElementById('formDespesa');
				if (formDespesa) formDespesa.addEventListener('submit', this.handleDespesaSubmit.bind(this)); // [NOVO]

				// [FIX] Registrar submit do form de Receitas Avulsas
				const formReceita = document.getElementById('formReceitaAvulsa');
				if (formReceita) formReceita.addEventListener('submit', this.handleReceitaSubmit.bind(this));

				const viewToggleButton = document.getElementById('view-toggle-button');
				if (viewToggleButton) {
					viewToggleButton.addEventListener('click', this.toggleViewMode.bind(this));
				}

				// [INÍCIO DA ALTERAÇÃO - OFICINA]
				// Formulário da Oficina
				document.getElementById('formAddAdvogado').addEventListener('submit', this.handleAddAdvogado.bind(this));
				document.getElementById('formAddCategoria')?.addEventListener('submit', this.handleAddCategoria.bind(this));
				// [FIM DA ALTERAÇÃO - OFICINA]

				// Botão de Adicionar Serviço
				document.getElementById('addServiceButton').addEventListener('click', this.handleAddServiceTag.bind(this));

				// [NOVO] Botão de Adicionar Diligência
				document.getElementById('addDiligenciaButton')?.addEventListener('click', () => {
					const descInput = document.getElementById('contratoDiligenciaDesc');
					const valorInput = document.getElementById('contratoDiligenciaValor');
					const dataInput = document.getElementById('contratoDiligenciaData');
					const pagadorInput = document.getElementById('contratoDiligenciaPagador');

					const desc = Utils.sanitizeText(descInput.value);
					const valor = Utils.parseNumber(valorInput.value);
					const data = dataInput.value;
					const pagador = pagadorInput?.value || 'Escritório';

					if (desc && !isNaN(valor) && valor > 0 && data) {
						this.createDiligenciaTag(desc, valor, data, pagador);
						descInput.value = '';
						valorInput.value = '';
						dataInput.value = '';
						descInput.focus();
					} else {
						Utils.showToast('Preencha a descrição, valor e data da diligência.', 'error');
					}
				});

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

					pdfBtn.addEventListener('click', () => this.exportReportPDF());
				}

				// [NOVO v5.6] Listeners para o modal de contrato
				const financialInputs = ['valorTotal', 'numParcelas', 'vencimentoPrimeiraParcela', 'contratoJaQuitado'];
				financialInputs.forEach(id => {
					document.getElementById(id)?.addEventListener('change', () => {
						document.getElementById('financialDataChanged').value = 'true';
					});
				});

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
						if (this.isUserAdmin) {
							this.firebaseService.startOfficeExpensesListener();
							this.firebaseService.startExtraRevenuesListener(); // [FIX] Listener de receitas
						}
					}
				} else {
					// Utilizador deslogado
					this.currentUserDisplayName = null;
					this.currentSafeName = null;
					this.isUserAdmin = false;
					this.lastOverdueCheck = null; // [NOVO v5.4] Reseta o cheque de vencidos
					this.lastExpensesCheck = null; // [NOVO]
					document.body.classList.remove('is-admin');
					this.authOverlay.style.display = 'flex'; // Mostra o novo ecrã de login
					this.appContainer.style.display = 'none';
					this.loadingOverlay.style.display = 'none';
					this.firebaseService.stopSnapshotListener();
					this.firebaseService.stopNotificationListener(); // [MUDANÇA v5]
					// [INÍCIO DA ALTERAÇÃO - OFICINA]
					this.firebaseService.stopSystemSettingsListener(); // Para o listener de configs
					this.firebaseService.stopOfficeExpensesListener(); // [NOVO]
					// [FIM DA ALTERAÇÃO - OFICINA]
				}
			}

			// [NOVO] Lógica do Módulo Financeiro do Escritório
			toggleViewMode() {
				this.viewMode = this.viewMode === 'cliente' ? 'escritorio' : 'cliente';
				const label = document.getElementById('view-toggle-label');
				
				const clienteTabs = ['tab-parcelas', 'tab-servicos', 'tab-performance', 'tab-relatorios'];
				const escritorioTabs = ['tab-avulsas'];
				
				if (this.viewMode === 'cliente') {
					label.textContent = 'CLIENTE';
					label.className = 'text-xs font-bold bg-indigo-600 px-2 py-0.5 rounded text-white';
					
					// Mostrar abas do cliente, esconder as do escritório
					clienteTabs.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'flex'; });
					escritorioTabs.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
					
					if (this.currentPageId === 'page-escritorio' || this.currentPageId === 'page-dashboard' || escritorioTabs.some(t => t.includes(this.currentPageId.split('-')[1]))) {
						this.showPage('page-dashboard');
					}
				} else {
					label.textContent = 'ESCRITÓRIO';
					label.className = 'text-xs font-bold bg-red-600 px-2 py-0.5 rounded text-white';
					
					// Esconder abas do cliente, mostrar as do escritório
					clienteTabs.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
					escritorioTabs.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'flex'; });
					
					if (this.currentPageId === 'page-escritorio' || this.currentPageId === 'page-dashboard' || clienteTabs.some(t => t.includes(this.currentPageId.split('-')[1]))) {
						this.showPage('page-escritorio');
					}
				}
			}

			handleOfficeExpensesUpdate(expenses) {
				this.database.officeExpenses = expenses;
				this.checkAndNotifyExpenses(expenses);
				if (this.currentPageId === 'page-escritorio') {
					this.renderDespesas();
				}
			}

			openDespesaModal(expenseId = null) {
				const title = document.getElementById('modalDespesaTitle');
				const form = document.getElementById('formDespesa');
				form.reset();
				document.getElementById('despesaId').value = '';
				document.getElementById('divDespesaPagamento').classList.add('hidden');

				if (expenseId) {
					const exp = this.database.officeExpenses.find(e => e.id === expenseId);
					if (exp) {
						title.textContent = 'Editar Despesa';
						document.getElementById('despesaId').value = exp.id;
						document.getElementById('despesaDescricao').value = exp.description;
						document.getElementById('despesaCategoria').value = exp.category;
						document.getElementById('despesaVencimento').value = exp.dueDate;
						document.getElementById('despesaValor').value = exp.value;
						if (exp.status === 'Paga') {
							document.getElementById('despesaPaga').checked = true;
							document.getElementById('divDespesaPagamento').classList.remove('hidden');
							document.getElementById('despesaDataPagamento').value = exp.paymentDate || '';
						}
					}
				} else {
					title.textContent = 'Registrar Despesa';
				}

				document.getElementById('despesaPaga').onchange = (e) => {
					document.getElementById('divDespesaPagamento').classList.toggle('hidden', !e.target.checked);
				};

				this.openModal('modalDespesa');
			}

			async handleDespesaSubmit(e) {
				e.preventDefault();
				const btn = e.submitter;
				const originalText = btn.innerHTML;
				btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
				btn.disabled = true;

				const id = document.getElementById('despesaId').value;
				const isPaga = document.getElementById('despesaPaga').checked;
				const data = {
					description: Utils.sanitizeText(document.getElementById('despesaDescricao').value),
					category: document.getElementById('despesaCategoria').value,
					dueDate: document.getElementById('despesaVencimento').value,
					value: Utils.parseNumber(document.getElementById('despesaValor').value),
					status: isPaga ? 'Paga' : 'Pendente',
					paymentDate: isPaga ? document.getElementById('despesaDataPagamento').value : null,
					updatedAt: new Date().toISOString()
				};

				console.log("App: Tentando salvar despesa...", data);
				console.log("App: FirebaseService status:", this.firebaseService.db ? "DB Pronto" : "DB Nulo");

				let success = false;
				if (id) {
					success = await this.firebaseService.updateOfficeExpense(id, data);
				} else {
					data.createdAt = new Date().toISOString();
					success = await this.firebaseService.addOfficeExpense(data);
				}

				if (success) this.closeModal('modalDespesa');
				
				btn.innerHTML = originalText;
				btn.disabled = false;
			}

			renderDespesas() {
				const filter = document.getElementById('despesasMonthFilter').value; // 'YYYY-MM'
				let expenses = [...(this.database.officeExpenses || [])].filter(e => !e.isDeleted);
				
				if (filter) {
					expenses = expenses.filter(e => e.dueDate.startsWith(filter));
				}
				
				expenses.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

				const tbody = document.getElementById('despesasList');
				const emptyState = document.getElementById('despesasEmptyState');
				const table = document.getElementById('table-despesas');

				let totalApagar = 0;
				let totalPago = 0;

				tbody.innerHTML = '';
				
				if (expenses.length === 0) {
					table.classList.add('hidden');
					emptyState.classList.remove('hidden');
				} else {
					table.classList.remove('hidden');
					emptyState.classList.add('hidden');

					expenses.forEach(exp => {
						if (exp.status === 'Paga') {
							totalPago += exp.value;
						} else {
							totalApagar += exp.value;
						}

						const tr = document.createElement('tr');
						tr.className = "hover:bg-gray-800/50 transition-colors border-b border-gray-700/50";
						
						const statusColor = exp.status === 'Paga' ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10';
						const dateObj = new Date(exp.dueDate + 'T12:00:00Z');
						
						tr.innerHTML = `
							<td class="p-3 text-white">${exp.description}</td>
							<td class="p-3 text-gray-400 text-sm">${exp.category}</td>
							<td class="p-3 text-gray-300">${dateObj.toLocaleDateString('pt-BR')}</td>
							<td class="p-3 font-semibold text-gray-200">${Utils.formatCurrency(exp.value)}</td>
							<td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold ${statusColor}">${exp.status}</span></td>
							<td class="p-3 text-right">
								<button onclick="window.App.openDespesaModal('${exp.id}')" class="text-indigo-400 hover:text-indigo-300 mr-3" title="Editar"><i class="fas fa-edit"></i></button>
								<button onclick="window.App.deleteDespesa('${exp.id}')" class="text-red-400 hover:text-red-300" title="Excluir"><i class="fas fa-trash"></i></button>
							</td>
						`;
						tbody.appendChild(tr);
					});
				}

				document.getElementById('dash-escritorio-apagar').textContent = Utils.formatCurrency(totalApagar);
				document.getElementById('dash-escritorio-pago').textContent = Utils.formatCurrency(totalPago);
			}

			async deleteDespesa(id) {
				if (confirm('Tem certeza que deseja mover esta despesa para a lixeira?')) {
					await this.firebaseService.updateOfficeExpenseField(id, { isDeleted: true });
					Utils.showToast('Despesa movida para a lixeira.', 'success');
				}
			}

			// [NOVO] Módulo de Receitas Avulsas
			handleExtraRevenuesUpdate(revenues) {
				this.database.extraRevenues = revenues;
				if (this.currentPageId === 'page-avulsas') {
					this.renderReceitasAvulsas();
				}
			}

			openReceitaAvulsaModal(receitaId = null) {
				const title = document.getElementById('modalReceitaTitle');
				const form = document.getElementById('formReceitaAvulsa');
				form.reset();
				document.getElementById('receitaId').value = '';

				if (receitaId) {
					const rec = this.database.extraRevenues.find(e => e.id === receitaId);
					if (rec) {
						title.textContent = 'Editar Receita Avulsa';
						document.getElementById('receitaId').value = rec.id;
						document.getElementById('receitaDescricao').value = rec.description;
						document.getElementById('receitaOrigem').value = rec.origin;
						document.getElementById('receitaData').value = rec.date;
						document.getElementById('receitaValor').value = rec.value;
					}
				} else {
					title.textContent = 'Registrar Receita Avulsa';
				}
				this.openModal('modalReceitaAvulsa');
			}

			async handleReceitaSubmit(e) {
				e.preventDefault();
				const btn = e.submitter;
				const originalText = btn.innerHTML;
				btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
				btn.disabled = true;

				const id = document.getElementById('receitaId').value;
				const data = {
					description: Utils.sanitizeText(document.getElementById('receitaDescricao').value),
					origin: Utils.sanitizeText(document.getElementById('receitaOrigem').value),
					date: document.getElementById('receitaData').value,
					value: Utils.parseNumber(document.getElementById('receitaValor').value),
					updatedAt: new Date().toISOString()
				};

				let success = false;
				if (id) {
					success = await this.firebaseService.updateExtraRevenue(id, data);
				} else {
					data.createdAt = new Date().toISOString();
					success = await this.firebaseService.addExtraRevenue(data);
				}

				if (success) this.closeModal('modalReceitaAvulsa');
				
				btn.innerHTML = originalText;
				btn.disabled = false;
			}

			renderReceitasAvulsas() {
				let revenues = [...(this.database.extraRevenues || [])].filter(r => !r.isDeleted);
				revenues.sort((a, b) => new Date(b.date) - new Date(a.date));

				const tbody = document.getElementById('receitasAvulsasList');
				const emptyState = document.getElementById('receitasAvulsasEmptyState');
				const table = document.getElementById('table-receitas-avulsas');

				tbody.innerHTML = '';
				
				if (revenues.length === 0) {
					table.classList.add('hidden');
					emptyState.classList.remove('hidden');
				} else {
					table.classList.remove('hidden');
					emptyState.classList.add('hidden');

					revenues.forEach(rec => {
						const tr = document.createElement('tr');
						tr.className = "hover:bg-gray-800/50 transition-colors border-b border-gray-700/50";
						
						const dateObj = new Date(rec.date + 'T12:00:00Z');
						
						tr.innerHTML = `
							<td class="p-3 text-white">${rec.description}</td>
							<td class="p-3 text-gray-400">${rec.origin}</td>
							<td class="p-3 text-gray-300">${dateObj.toLocaleDateString('pt-BR')}</td>
							<td class="p-3 font-bold text-green-400">+ ${Utils.formatCurrency(rec.value)}</td>
							<td class="p-3 text-right">
								<button onclick="window.App.openReceitaAvulsaModal('${rec.id}')" class="text-indigo-400 hover:text-indigo-300 mr-3" title="Editar"><i class="fas fa-edit"></i></button>
								<button onclick="window.App.deleteReceita('${rec.id}')" class="text-red-400 hover:text-red-300" title="Excluir"><i class="fas fa-trash"></i></button>
							</td>
						`;
						tbody.appendChild(tr);
					});
				}
			}

			async deleteReceita(id) {
				if (confirm('Tem certeza que deseja mover esta receita avulsa para a lixeira?')) {
					await this.firebaseService.updateExtraRevenueField(id, { isDeleted: true });
					Utils.showToast('Receita movida para a lixeira.', 'success');
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
				if (!settings.categorias) {
					settings.categorias = { list: [] };
				}

				this.database.settings = settings;

				// Atualiza todos os componentes que dependem da lista de advogados e categorias
				this.renderAdvogadoFilters();
				this.populateAdvogadoSelectModal();
				this.populateCategoriaSelectModal();

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
				} else if (pageId === 'page-escritorio') { // [NOVO]
					this.renderDespesas();
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
					parcelasList.sort((a, b) => {
						const nameCmp = a.contract.clientName.localeCompare(b.contract.clientName);
						if (nameCmp !== 0) return nameCmp;
						return a.diffDays - b.diffDays;
					});
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

			// [CORREÇÃO LIXEIRA] Lógica atualizada para suportar Contexto (Cliente / Escritório)
			renderLixeiraPage() {
				const container = document.getElementById('lixeiraListContainer');
				container.innerHTML = '';
				const fragment = document.createDocumentFragment();

				if (this.viewMode === 'cliente') {
					document.querySelector('#page-lixeira h2').textContent = 'Lixeira de Contratos';
					document.querySelector('#page-lixeira p').textContent = 'Contratos excluídos são mantidos aqui. Pode restaurá-los ou excluí-los permanentemente (apenas admins).';
					
					const contractsToRender = this.getFilteredContracts(true);
					const deletedContracts = contractsToRender.filter(c => c.isDeleted === true);

					if (deletedContracts.length === 0) {
						container.innerHTML = `<div class="col-span-1 md:col-span-3 text-center py-10"><div class="inline-block dark-card shadow-lg text-gray-400 p-6 rounded-lg"><i class="fas fa-trash fa-3x mb-3"></i><p class="font-bold text-xl">Lixeira Vazia</p><p class="text-sm">Nenhum contrato foi excluído.</p></div></div>`;
						return;
					}

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
				} else {
					document.querySelector('#page-lixeira h2').textContent = 'Lixeira do Escritório';
					document.querySelector('#page-lixeira p').textContent = 'Despesas e Receitas Avulsas excluídas são mantidas aqui. Pode restaurá-las ou excluí-las permanentemente (apenas admins).';
					
					const deletedExpenses = (this.database.officeExpenses || []).filter(e => e.isDeleted === true);
					const deletedRevenues = (this.database.extraRevenues || []).filter(r => r.isDeleted === true);
					
					const allDeleted = [
						...deletedExpenses.map(e => ({...e, _type: 'Despesa'})),
						...deletedRevenues.map(r => ({...r, _type: 'Receita'}))
					];

					if (allDeleted.length === 0) {
						container.innerHTML = `<div class="col-span-1 md:col-span-3 text-center py-10"><div class="inline-block dark-card shadow-lg text-gray-400 p-6 rounded-lg"><i class="fas fa-trash fa-3x mb-3"></i><p class="font-bold text-xl">Lixeira Vazia</p><p class="text-sm">Nenhum registro foi excluído.</p></div></div>`;
						return;
					}

					allDeleted.forEach(item => {
						const isDespesa = item._type === 'Despesa';
						const borderColor = isDespesa ? 'border-red-500' : 'border-green-500';
						const icon = isDespesa ? '<i class="fas fa-arrow-down text-red-500 mr-2"></i>' : '<i class="fas fa-arrow-up text-green-500 mr-2"></i>';
						
						const card = this.domBuilder.buildElement('div', { className: `dark-card shadow-lg p-5 rounded-lg border-l-4 ${borderColor} transition-all duration-200 hover:-translate-y-1` });
						card.append(this.domBuilder.buildElement('p', { className: 'font-bold text-lg text-white flex items-center', html: `${icon} ${item._type}` }));
						card.append(this.domBuilder.buildElement('p', { className: 'text-sm text-gray-300 mb-1', text: isDespesa ? item.description : item.origin }));
						card.append(this.domBuilder.buildElement('p', { className: 'text-sm text-gray-400 mb-3', html: `Valor: <span class="font-bold text-white">${Utils.formatCurrency(item.value)}</span>` }));

						const footer = this.domBuilder.buildElement('div', { className: 'border-t border-gray-700 pt-3 mt-3 flex gap-2' });

						const restoreBtn = this.domBuilder.buildElement('button', { className: 'w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-2 px-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2', html: '<i class="fas fa-undo"></i> Restaurar' });
						restoreBtn.onclick = () => isDespesa ? this.restoreDespesa(item.id) : this.restoreReceita(item.id);
						footer.append(restoreBtn);

						if (this.isUserAdmin) {
							const deleteBtn = this.domBuilder.buildElement('button', { className: 'w-full bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 text-white font-semibold py-2 px-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2', html: '<i class="fas fa-times-circle"></i> Excluir Prmt.' });
							deleteBtn.onclick = () => isDespesa ? this.permanentDeleteDespesa(item.id) : this.permanentDeleteReceita(item.id);
							footer.append(deleteBtn);
						}

						card.append(footer);
						fragment.append(card);
					});
				}
				container.append(fragment);
			}

			async restoreDespesa(id) {
				const ok = await Utils.confirm(`Tem certeza que deseja restaurar esta despesa?`);
				if (!ok) return;
				const success = await this.firebaseService.updateOfficeExpenseField(id, { isDeleted: false });
				if (success) Utils.showToast('Despesa restaurada.', 'success');
			}

			async permanentDeleteDespesa(id) {
				if (!this.isUserAdmin) return;
				const ok = await Utils.confirm(`EXCLUSÃO PERMANENTE: Tem a certeza? Esta ação não pode ser desfeita.`);
				if (!ok) return;
				await this.firebaseService.deleteOfficeExpense(id);
			}

			async restoreReceita(id) {
				const ok = await Utils.confirm(`Tem certeza que deseja restaurar esta receita avulsa?`);
				if (!ok) return;
				const success = await this.firebaseService.updateExtraRevenueField(id, { isDeleted: false });
				if (success) Utils.showToast('Receita restaurada.', 'success');
			}

			async permanentDeleteReceita(id) {
				if (!this.isUserAdmin) return;
				const ok = await Utils.confirm(`EXCLUSÃO PERMANENTE: Tem a certeza? Esta ação não pode ser desfeita.`);
				if (!ok) return;
				await this.firebaseService.deleteExtraRevenue(id);
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
				const categoriaContainer = document.getElementById('categoriaSettingsList');
				
				if (listContainer) {
					listContainer.innerHTML = ''; // Limpa a lista antiga
					const fragment = document.createDocumentFragment();
					const advogadosList = this.database.settings.advogados?.list || [];

					if (advogadosList.length === 0) {
						listContainer.innerHTML = `<p class="text-sm text-gray-400 text-center p-4">Nenhum advogado cadastrado.</p>`;
					} else {
						// Ordena alfabeticamente para exibição
						[...advogadosList].sort().forEach(name => {
							fragment.append(this.domBuilder.createSettingListItem(name, 'advogado'));
						});
						listContainer.append(fragment);
					}
				}

				if (categoriaContainer) {
					categoriaContainer.innerHTML = '';
					const fragmentCat = document.createDocumentFragment();
					const categoriasList = this.database.settings.categorias?.list || [];

					if (categoriasList.length === 0) {
						categoriaContainer.innerHTML = `<p class="text-sm text-gray-400 text-center p-4">Nenhuma categoria cadastrada.</p>`;
					} else {
						[...categoriasList].sort().forEach(name => {
							fragmentCat.append(this.domBuilder.createSettingListItem(name, 'categoria'));
						});
						categoriaContainer.append(fragmentCat);
					}
				}
			}
			// [FIM DA ALTERAÇÃO - OFICINA]

			// --- 4. LÓGICA DE UI (Filtros, Abas, Helpers) ---

			showPage(pageId) {
				const pageTitles = {
					'page-dashboard': 'Painel Principal',
					'page-escritorio': 'Gestão Administrativa', // [NOVO]
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
				['page-dashboard', 'page-parcelas', 'page-servicos', 'page-lixeira', 'page-relatorios', 'page-performance', 'page-oficina', 'page-escritorio', 'page-avulsas'].forEach(id => {
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
				let tabBaseId = pageId.split('-')[1];
				if (tabBaseId === 'escritorio') tabBaseId = 'dashboard'; // Compartilha a aba "Painel Principal"
				
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


				let filtered = [];
				// 1. Filtro de Usuário vs Admin
				if (this.isUserAdmin) {
					filtered = includeDeleted ? allContracts : allContracts.filter(c => !c.isDeleted);
				} else {
					filtered = allContracts.filter(c => c.advogadoResponsavel === this.currentUserDisplayName && (includeDeleted ? true : !c.isDeleted));
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

			populateCategoriaSelectModal() {
				const select = document.getElementById('despesaCategoria');
				if (!select) return;
				const currentValue = select.value;
				select.innerHTML = '';
				
				const categorias = this.database.settings.categorias?.list || [];
				if (categorias.length === 0) {
					select.add(new Option("Nenhuma categoria (Adicione na Oficina)", ""));
				} else {
					select.add(new Option("Selecione uma categoria...", ""));
					[...categorias].sort().forEach(cat => {
						select.add(new Option(cat, cat));
					});
				}

				if (currentValue && categorias.includes(currentValue)) {
					select.value = currentValue;
				}
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
					clientEmail: Utils.sanitizeText(document.getElementById('clienteEmail').value),
					clientBankDetails: Utils.sanitizeText(document.getElementById('clienteDadosBancarios').value),
					advogadoResponsavel: Utils.sanitizeText(document.getElementById('advogadoResponsavel').value),
					serviceTypes,
					paymentType: Utils.sanitizeText(document.getElementById('contratoTipoPagamento').value),
					observations: Utils.sanitizeText(document.getElementById('contratoObservacoes').value),
					isSpecialContract: isSpecialContract // Salva o tipo de contrato
				};

				// [NOVO] Lê diligências pendentes recém-adicionadas no form
				const diligenciaTags = document.querySelectorAll('#diligenciasContainer .diligencia-tag');
				const pendingDiligencias = Array.from(diligenciaTags).map(tag => ({
					number: 'Dilig.',
					description: Utils.sanitizeText(tag.dataset.description),
					value: parseFloat(tag.dataset.value),
					dueDate: new Date(tag.dataset.dueDate + 'T12:00:00Z').toISOString(),
					status: 'Pendente',
					valuePaid: 0,
					paymentDate: null,
					isDiligencia: true,
					paidBy: tag.dataset.paidBy || 'Escritório'
				}));

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

					const diligenciasTotal = pendingDiligencias.reduce((sum, d) => sum + d.value, 0);
					Object.assign(contractData, {
						totalValue: generatedData.totalValue + diligenciasTotal,
						parcels: [...generatedData.parcels, ...pendingDiligencias],
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

						const oldDiligencias = (existingContract.parcels || []).filter(p => p.isDiligencia);
						const totalDiligencias = oldDiligencias.reduce((sum, d) => sum + d.value, 0) + pendingDiligencias.reduce((sum, d) => sum + d.value, 0);

						contractData.parcels = [...generatedData.parcels, ...oldDiligencias, ...pendingDiligencias]; 
						contractData.totalValue = generatedData.totalValue + totalDiligencias; 
						Utils.showToast('Parcelas recaluladas com sucesso!', 'info');
					} else if (existingContract) {
						// Mantém as parcelas existentes se nada mudou, mas anexa novas diligências
						contractData.parcels = [...existingContract.parcels, ...pendingDiligencias];
						contractData.totalValue = existingContract.totalValue + pendingDiligencias.reduce((sum, d) => sum + d.value, 0); 
					}

					// Limpa o container de diligências após processar
					document.getElementById('diligenciasContainer').innerHTML = '';

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
								name: 'Comprovativo: ' + anexoFile.name,
								type: anexoFile.type,
								data: base64Data,
								uploadedAt: new Date().toISOString(),
								uploadedBy: this.currentUserDisplayName
							});
						} else {
							Utils.showToast('Comprovativo ignorado: muito grande (>300KB).', 'error');
						}
					}

					// Processar NF se existir
					const nfFile = document.getElementById('pagamentoNotaFiscal').files[0];
					if (nfFile) {
						if (Utils.validateFileSize(nfFile, 0.3)) {
							const base64Data = await Utils.fileToBase64(nfFile);
							if (!parcel.attachments) parcel.attachments = [];
							parcel.attachments.push({
								name: 'NF: ' + nfFile.name,
								type: nfFile.type,
								data: base64Data,
								uploadedAt: new Date().toISOString(),
								uploadedBy: this.currentUserDisplayName
							});
						} else {
							Utils.showToast('NF ignorada: muito grande (>300KB).', 'error');
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

			// [NOVO] Notifica despesas que vencem hoje ou amanhã
			checkAndNotifyExpenses(expenses) {
				if (!this.isUserAdmin) return;
				const hoje = new Date();
				const hojeStr = hoje.toISOString().split('T')[0];

				if (this.lastExpensesCheck === hojeStr) return;

				const tomorrow = new Date(hoje);
				tomorrow.setDate(hoje.getDate() + 1);
				const amanhaStr = tomorrow.toISOString().split('T')[0];

				expenses.forEach(exp => {
					if (exp.status === 'Pendente') {
						if (exp.dueDate === hojeStr) {
							this.sendNotification(this.currentSafeName, {
								message: `A despesa "${exp.description}" (${Utils.formatCurrency(exp.value)}) vence HOJE!`,
								sender: "Sistema Administrativo"
							});
						} else if (exp.dueDate === amanhaStr) {
							this.sendNotification(this.currentSafeName, {
								message: `A despesa "${exp.description}" (${Utils.formatCurrency(exp.value)}) vence amanhã.`,
								sender: "Sistema Administrativo"
							});
						}
					}
				});

				this.lastExpensesCheck = hojeStr;
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

			async handleAddCategoria(e) {
				e.preventDefault();
				if (!this.isUserAdmin) return;

				const nameInput = document.getElementById('inputCategoriaName');
				const newName = Utils.sanitizeText(nameInput.value);

				if (!newName) {
					Utils.showToast('Categoria não pode estar vazia.', 'error');
					return;
				}

				const currentList = this.database.settings.categorias?.list || [];

				if (currentList.map(name => name.toLowerCase()).includes(newName.toLowerCase())) {
					Utils.showToast('Esta categoria já está na lista.', 'error');
					return;
				}

				const updatedList = [...currentList, newName];
				await this.firebaseService.saveSystemSettings('categorias', { list: updatedList });

				nameInput.value = '';
				Utils.showToast(`Categoria "${newName}" adicionada!`, 'success');
			}

			async handleRemoveCategoria(nameToRemove) {
				if (!this.isUserAdmin) return;

				const ok = await Utils.confirm(`Tem a certeza que deseja remover a categoria "${nameToRemove}"?`);
				if (!ok) return;

				const currentList = this.database.settings.categorias?.list || [];
				const updatedList = currentList.filter(name => name !== nameToRemove);

				await this.firebaseService.saveSystemSettings('categorias', { list: updatedList });
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
						document.getElementById('clienteEmail').value = contract.clientEmail || '';
						document.getElementById('clienteDadosBancarios').value = contract.clientBankDetails || '';
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
				const nfInput = document.getElementById('pagamentoNotaFiscal');
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
				if (nfInput) {
					nfInput.value = '';

					// Adiciona classes para efeito visual de "Drop Zone"
					const dropContainerNf = nfInput.parentElement;
					dropContainerNf.classList.add('border', 'border-transparent', 'rounded-md', 'transition-colors', 'duration-200');

					Utils.setupDragAndDrop(dropContainerNf, (file) => {
						const dt = new DataTransfer();
						dt.items.add(file);
						nfInput.files = dt.files;
						Utils.showToast(`NF "${file.name}" selecionada!`, 'info');
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

				// [NOVO] HTML das Custas (Diligências)
				let custasHtml = '';
				if (income.diligenciasPorContrato && income.diligenciasPorContrato.length > 0) {
					custasHtml += `
						<h4 class="text-lg font-semibold mt-6 border-t border-gray-700 pt-4 text-orange-400">
							<i class="fas fa-file-invoice mr-2"></i>Custas e Diligências
						</h4>
						<div class="grid grid-cols-2 gap-3 mt-3 mb-3">
							<div class="dark-card p-3 rounded-lg border-l-4 border-purple-500 text-center">
								<p class="text-xs text-gray-400 uppercase">Pagas pelo Escritório</p>
								<p class="text-xl font-bold text-purple-400 mt-1">${Utils.formatCurrency(income.totalCustasEscritorio)}</p>
								<p class="text-xs text-gray-500 mt-1">A reembolsar pelo cliente</p>
							</div>
							<div class="dark-card p-3 rounded-lg border-l-4 border-blue-500 text-center">
								<p class="text-xs text-gray-400 uppercase">Pagas pelo Cliente</p>
								<p class="text-xl font-bold text-blue-400 mt-1">${Utils.formatCurrency(income.totalCustasCliente)}</p>
								<p class="text-xs text-gray-500 mt-1">Já quitadas pelo cliente</p>
							</div>
						</div>
						<ul class="space-y-2 text-sm">`;
					income.diligenciasPorContrato.forEach(c => {
						custasHtml += `<li class="bg-gray-700/40 p-3 rounded-lg border border-gray-600">
							<p class="font-bold text-white mb-2">${c.clientName} <span class="text-xs text-gray-400 font-normal">(${c.advogado})</span></p>`;
						c.custasEscritorio.forEach(d => {
							custasHtml += `<div class="flex justify-between items-center py-1 border-b border-gray-700/50">
								<span class="text-gray-300 text-xs"><span class="text-purple-400 mr-1">🏢</span>${d.descricao} <span class="text-gray-500">(${Utils.formatDate(d.data)})</span></span>
								<span class="text-purple-300 font-semibold text-xs">${Utils.formatCurrency(d.valor)}</span>
							</div>`;
						});
						c.custasCliente.forEach(d => {
							custasHtml += `<div class="flex justify-between items-center py-1 border-b border-gray-700/50">
								<span class="text-gray-300 text-xs"><span class="text-blue-400 mr-1">👤</span>${d.descricao} <span class="text-gray-500">(${Utils.formatDate(d.data)})</span></span>
								<span class="text-blue-300 font-semibold text-xs">${Utils.formatCurrency(d.valor)}</span>
							</div>`;
						});
						custasHtml += `</li>`;
					});
					custasHtml += `</ul>`;
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
        ` + custasHtml + detailsHtml + defaultersHtml;
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

			// [NOVO] Tag visual para Diligências pendentes de salvamento
			createDiligenciaTag(description, value, dueDate, pagador = 'Escritório') {
				const container = document.getElementById('diligenciasContainer');
				const tag = this.domBuilder.buildElement('div', { className: 'diligencia-tag flex items-center justify-between bg-gray-800 border border-gray-700 p-2 rounded mb-2' });
				tag.dataset.description = description;
				tag.dataset.value = value;
				tag.dataset.dueDate = dueDate;
				tag.dataset.paidBy = pagador;

				const prazo = new Date(dueDate + "T12:00:00Z");
				const pagadorColor = pagador === 'Cliente' ? 'text-blue-400 bg-blue-400/10' : 'text-purple-400 bg-purple-400/10';
				const pagadorIcon = pagador === 'Cliente' ? '&#128100;' : '&#127970;';
				
				tag.innerHTML = `
					<div class="flex flex-col">
						<span class="text-white text-sm font-semibold">${description} <span class="text-xs text-orange-400 bg-orange-400/10 px-1 py-0.5 rounded ml-2">Diligência</span> <span class="text-xs ${pagadorColor} px-1 py-0.5 rounded ml-1">${pagadorIcon} ${pagador} pagou</span></span>
						<span class="text-xs text-gray-400 mt-1"><i class="fas fa-calendar-alt mr-1"></i>Venc: ${Utils.formatDate(prazo)} &nbsp;|&nbsp; <i class="fas fa-dollar-sign mr-1"></i>Valor: ${Utils.formatCurrency(value)}</span>
					</div>
					<button type="button" class="text-red-400 hover:text-red-300 font-bold text-lg p-2" onclick="this.parentElement.remove()">&times;</button>
				`;
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
						<h3 class="text-xs font-semibold text-gray-400 uppercase" title="Parcelas + Êxitos + Avulsas">Total Receitas</h3>
						<p class="text-2xl font-bold text-green-400 mt-1">${Utils.formatCurrency(data.totalGeral)}</p>
					</div>
					<div class="dark-card p-4 rounded-lg shadow-lg text-center border-l-4 border-red-500">
						<h3 class="text-xs font-semibold text-gray-400 uppercase">Total Despesas</h3>
						<p class="text-xl font-bold text-red-400 mt-1">- ${Utils.formatCurrency(data.totalDespesas)}</p>
					</div>
					<div class="dark-card p-4 rounded-lg shadow-lg text-center border-l-4 ${data.saldoLiquido >= 0 ? 'border-blue-500' : 'border-red-600'}">
						<h3 class="text-xs font-semibold text-gray-400 uppercase">Saldo Líquido</h3>
						<p class="text-2xl font-bold ${data.saldoLiquido >= 0 ? 'text-blue-400' : 'text-red-500'} mt-1">${Utils.formatCurrency(data.saldoLiquido)}</p>
					</div>
					<div class="dark-card p-4 rounded-lg shadow-lg text-center border-l-4 border-yellow-500 bg-yellow-900/10">
						<h3 class="text-xs font-semibold text-yellow-500 uppercase">Inadimplência</h3>
						<p class="text-xl font-bold text-yellow-500 mt-1">${Utils.formatCurrency(data.totalVencido)}</p>
					</div>
					<div class="dark-card p-4 rounded-lg shadow-lg text-center border-l-4 border-indigo-500">
						<h3 class="text-xs font-semibold text-gray-400 uppercase">Novos Contratos</h3>
						<p class="text-xl font-bold text-indigo-400 mt-1">${data.totalContratos}</p>
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
						['Total Receitas', Utils.formatCurrency(data.totalGeral)],
						['Total Despesas', Utils.formatCurrency(data.totalDespesas || 0)],
						['Saldo Líquido', Utils.formatCurrency(data.saldoLiquido || 0)],
						['Inadimplência', Utils.formatCurrency(data.totalVencido)],
						['Novos Contratos', data.totalContratos],
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
