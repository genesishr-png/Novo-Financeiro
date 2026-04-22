export const Utils = {
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
		}