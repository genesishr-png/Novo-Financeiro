import { getFirestore, collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, setLogLevel, writeBatch, serverTimestamp, query, where, orderBy, limit, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { Utils } from './utils.js';

export class FirebaseService {
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