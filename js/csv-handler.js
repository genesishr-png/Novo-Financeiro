import { Utils } from './utils.js';

export class CSVHandler {
	constructor(appInstance) {
		this.app = appInstance;
		this.parsedRows = [];       // Dados puros extraídos do CSV
		this.reconciledRows = [];   // Dados após o cruzamento com o banco e conciliação
		this.currentMonthFilter = ''; // Formato "YYYY-MM"
		
		// Bancos suportados pelo sistema
		this.supportedBanks = ["Bradesco", "Caixa Econômica", "Banco do Brasil"];
	}

	initialize() {
		// Define o mês de referência atual (ex: 2026-05) como padrão no input
		const monthInput = document.getElementById('csvImportMonth');
		if (monthInput) {
			const now = new Date();
			const yyyy = now.getFullYear();
			const mm = String(now.getMonth() + 1).padStart(2, '0');
			monthInput.value = `${yyyy}-${mm}`;
			this.currentMonthFilter = monthInput.value;
			
			// Recalcula e re-renderiza quando o usuário muda o mês de filtro
			monthInput.addEventListener('change', (e) => {
				this.currentMonthFilter = e.target.value;
				if (this.parsedRows.length > 0) {
					this.reconcileData();
					this.renderPreview();
				}
			});
		}

		// Configura o Drag and Drop na zona de upload
		const dropZone = document.getElementById('csv-drop-zone');
		if (dropZone) {
			Utils.setupDragAndDrop(dropZone, (file) => this.handleFile(file));
			
			// Clique para abrir o file selector
			dropZone.addEventListener('click', () => {
				document.getElementById('csv-file-input').click();
			});
		}

		const fileInput = document.getElementById('csv-file-input');
		if (fileInput) {
			fileInput.addEventListener('change', (e) => {
				if (e.target.files && e.target.files.length > 0) {
					this.handleFile(e.target.files[0]);
				}
			});
		}

		// Selecionar / Deselecionar todos os checkboxes do preview
		document.getElementById('csvSelectAllBtn')?.addEventListener('click', () => this.toggleAllCheckboxes(true));
		document.getElementById('csvDeselectAllBtn')?.addEventListener('click', () => this.toggleAllCheckboxes(false));
		
		const headerCheckbox = document.getElementById('csvHeaderCheckbox');
		if (headerCheckbox) {
			headerCheckbox.addEventListener('change', (e) => this.toggleAllCheckboxes(e.target.checked));
		}

		// Registrar gravação final
		document.getElementById('csvSubmitImportBtn')?.addEventListener('click', () => this.saveImport());
	}

	// Método chamado pelo roteador em app.js quando a página é aberta
	renderImportPage() {
		// Define o título da página
		const pageTitle = document.getElementById('page-title');
		if (pageTitle) pageTitle.textContent = "Importar Planilha de Despesas";
		
		// Resetar estados se não houver planilha carregada
		if (this.parsedRows.length === 0) {
			document.getElementById('csv-preview-container').classList.add('hidden');
			this.updateSummaryDOM(0, 0, 0, 0);
		}
	}

	// --- 1. PARSING E LEITURA DE ARQUIVO ---

	handleFile(file) {
		if (!file) return;
		if (!file.name.endsWith('.csv')) {
			Utils.showToast('Por favor, envie apenas arquivos no formato .csv', 'error');
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target.result;
			this.parseCSV(text);
		};
		reader.readAsText(file, 'utf-8');
	}

	parseCSV(text) {
		const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
		if (lines.length < 2) {
			Utils.showToast('O arquivo CSV está vazio ou não possui cabeçalhos válidos.', 'error');
			return;
		}

		// 1. Auto-detecta o delimitador (, ou ;)
		const firstLine = lines[0];
		const commaCount = (firstLine.match(/,/g) || []).length;
		const semicolonCount = (firstLine.match(/;/g) || []).length;
		const delimiter = semicolonCount > commaCount ? ';' : ',';

		// 2. Extrai cabeçalhos
		const headers = firstLine.split(delimiter).map(h => this.cleanHeaderName(h));
		
		// Mapeamento automático por similaridade
		const indexMap = {
			tipo: headers.findIndex(h => h.includes('tipo') && (h.includes('lancamento') || h.includes('movimentacao'))),
			competencia: headers.findIndex(h => h.includes('competencia') || h.includes('referencia')),
			vencimento: headers.findIndex(h => h.includes('vencimento') || h.includes('prazo')),
			cliente: headers.findIndex(h => h.includes('cliente') || h.includes('fornecedor') || h.includes('descricao')),
			valor: headers.findIndex(h => h.includes('valor') || h.includes('quantia') || h.includes('total')),
			status: headers.findIndex(h => h.includes('status') || h.includes('situacao')),
			pagamento: headers.findIndex(h => h.includes('pagamento') || h.includes('compensacao')),
			banco: headers.findIndex(h => h.includes('banco') || h.includes('conta')),
			dre: headers.findIndex(h => h.includes('dre') || h.includes('categoria') || h.includes('classificacao'))
		};

		// Valida se colunas vitais foram encontradas
		if (indexMap.cliente === -1 || indexMap.valor === -1) {
			Utils.showToast('Não foi possível identificar as colunas de "Cliente/Fornecedor" ou "Valor". Verifique o cabeçalho.', 'error');
			return;
		}

		this.parsedRows = [];

		// 3. Processa linhas
		for (let i = 1; i < lines.length; i++) {
			// Suporte inteligente a aspas em valores separados por delimitador
			const row = this.splitCsvRow(lines[i], delimiter);
			if (row.length < headers.length) continue; // Linha incompleta

			const tipo = indexMap.tipo !== -1 ? row[indexMap.tipo]?.trim() : 'Saída';
			const competencia = indexMap.competencia !== -1 ? row[indexMap.competencia]?.trim() : '';
			const rawVencimento = indexMap.vencimento !== -1 ? row[indexMap.vencimento]?.trim() : '';
			const rawCliente = row[indexMap.cliente]?.trim() || '';
			const rawValor = row[indexMap.valor]?.trim() || '';
			const status = indexMap.status !== -1 ? row[indexMap.status]?.trim() : 'Pendente';
			const rawPagamento = indexMap.pagamento !== -1 ? row[indexMap.pagamento]?.trim() : '';
			const rawBanco = indexMap.banco !== -1 ? row[indexMap.banco]?.trim() : '';
			const rawCategory = indexMap.dre !== -1 ? row[indexMap.dre]?.trim() : '';

			// Limpeza e normalização
			const valor = Utils.parseNumber(rawValor);
			if (isNaN(valor) || valor <= 0) continue; // Ignora valores inválidos

			const paymentDate = this.formatDateToISO(rawPagamento || rawVencimento);
			const dueDate = this.formatDateToISO(rawVencimento || rawPagamento);
			
			// Associa banco a banco suportado se possível
			const matchedBank = this.fuzzyMatchBank(rawBanco);

			this.parsedRows.push({
				tipo: tipo, // Saída ou Entrada
				competencia: competencia,
				dueDate: dueDate,
				paymentDate: paymentDate,
				description: rawCliente,
				value: valor,
				status: status,
				bank: matchedBank,
				category: rawCategory,
				rawRowIndex: i
			});
		}

		if (this.parsedRows.length === 0) {
			Utils.showToast('Nenhuma despesa válida encontrada no arquivo.', 'warning');
			return;
		}

		Utils.showToast(`Lidas ${this.parsedRows.length} linhas da planilha com sucesso!`, 'success');
		
		// Executa conciliação e renderiza
		this.reconcileData();
		this.renderPreview();
	}

	cleanHeaderName(str) {
		if (!str) return '';
		return str.trim()
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]/g, '');
	}

	splitCsvRow(line, delimiter) {
		const result = [];
		let current = '';
		let inQuotes = false;
		
		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			if (char === '"') {
				inQuotes = !inQuotes;
			} else if (char === delimiter && !inQuotes) {
				result.push(current.replace(/^"|"$/g, '').trim());
				current = '';
			} else {
				current += char;
			}
		}
		result.push(current.replace(/^"|"$/g, '').trim());
		return result;
	}

	formatDateToISO(dateStr) {
		if (!dateStr) return '';
		// Trata formato DD/MM/YYYY
		const parts = dateStr.split('/');
		if (parts.length === 3) {
			const d = parts[0].padStart(2, '0');
			const m = parts[1].padStart(2, '0');
			const y = parts[2];
			return `${y}-${m}-${d}`;
		}
		// Trata formato YYYY-MM-DD
		if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
			return dateStr;
		}
		return '';
	}

	fuzzyMatchBank(rawBanco) {
		if (!rawBanco) return '';
		const normalized = rawBanco.toLowerCase();
		if (normalized.includes('brasil') || normalized.includes('bb')) {
			return 'Banco do Brasil';
		}
		if (normalized.includes('bradesco')) {
			return 'Bradesco';
		}
		if (normalized.includes('caixa')) {
			return 'Caixa Econômica';
		}
		return '';
	}

	// --- 2. ASSIMILADOR DE PORTUGUÊS (FUZZY STRINGS) ---

	normalizeString(str) {
		if (!str) return '';
		return str.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "") // Remove acentos
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '') // Remove pontuações e caracteres especiais
			.replace(/\s+/g, ' ') // Substitui múltiplos espaços por um único
			.replace(/\b(ltda|cia|sa|e|de|da|do|com|a|o|para)\b/g, '') // Remove stopwords/sufixos comuns
			.replace(/\s+/g, ' ')
			.trim();
	}

	getLevenshteinSimilarity(s1, s2) {
		const norm1 = this.normalizeString(s1);
		const norm2 = this.normalizeString(s2);

		if (norm1 === norm2) return 1.0;
		if (norm1.length === 0 || norm2.length === 0) return 0.0;
		
		// Se um termo normalized estiver completamente contido no outro (substring)
		if (norm1.includes(norm2) || norm2.includes(norm1)) {
			return Math.min(norm1.length, norm2.length) / Math.max(norm1.length, norm2.length) * 0.95;
		}

		// Matriz Levenshtein
		const track = Array(norm2.length + 1).fill(null).map(() =>
			Array(norm1.length + 1).fill(null));
		for (let i = 0; i <= norm1.length; i += 1) {
			track[0][i] = i;
		}
		for (let j = 0; j <= norm2.length; j += 1) {
			track[j][0] = j;
		}
		for (let j = 1; j <= norm2.length; j += 1) {
			for (let i = 1; i <= norm1.length; i += 1) {
				const indicator = norm1[i - 1] === norm2[j - 1] ? 0 : 1;
				track[j][i] = Math.min(
					track[j][i - 1] + 1, // Exclusão
					track[j - 1][i] + 1, // Inserção
					track[j - 1][i - 1] + indicator // Substituição
				);
			}
		}

		const distance = track[norm2.length][norm1.length];
		const maxLength = Math.max(norm1.length, norm2.length);
		return 1.0 - (distance / maxLength);
	}

	// --- 3. ALGORITMO DE CONCILIAÇÃO FINANCEIRA ---

	reconcileData() {
		const filterMonth = this.currentMonthFilter; // "YYYY-MM"
		
		// 1. Pega todas as despesas REAIS do banco para o mês de referência
		const dbExpenses = (this.app.database.officeExpenses || [])
			.filter(e => !e.isDeleted && e.dueDate.startsWith(filterMonth));

		// 2. Pega todas as despesas FIXAS RECORRENTES (templates)
		const recurringTemplates = this.app.database.recurringExpenses || [];

		// Gera as despesas virtuais recorrentes do mês de forma temporária para cruzamento
		const virtualExpenses = [];
		recurringTemplates.forEach(template => {
			const alreadyPaid = dbExpenses.some(e => e.description.toLowerCase() === template.description.toLowerCase());
			if (!alreadyPaid) {
				virtualExpenses.push({
					id: `rec-${template.id}`,
					description: template.description,
					category: template.category,
					value: template.defaultValue || 0,
					dueDate: `${filterMonth}-05`,
					status: 'Pendente',
					isVirtual: true,
					isFixed: true
				});
			}
		});

		// Combina despesas reais e virtuais para cruzamento completo
		const allSystemExpenses = [...dbExpenses, ...virtualExpenses];
		this.reconciledRows = [];

		// Filtra as linhas da planilha que sejam do tipo "Saída"
		const exitsOnly = this.parsedRows.filter(row => row.tipo.toLowerCase() === 'saida');

		let countReconcile = 0;
		let countNew = 0;

		exitsOnly.forEach(row => {
			let bestMatch = null;
			let highestScore = 0.0;

			// Procura a melhor correspondência no sistema usando o Assimilador Fuzzy
			allSystemExpenses.forEach(sysExp => {
				const score = this.getLevenshteinSimilarity(row.description, sysExp.description);
				if (score > highestScore) {
					highestScore = score;
					bestMatch = sysExp;
				}
			});

			let action = 'NOVO';
			let matchedItem = null;
			let matchScorePercent = 0;

			// Se a similaridade for superior a 80% (0.80) consideraremos correspondência
			if (bestMatch && highestScore >= 0.80) {
				matchedItem = bestMatch;
				matchScorePercent = Math.round(highestScore * 100);

				if (bestMatch.status === 'Paga' && Math.abs(bestMatch.value - row.value) < 1.0) {
					// Já existe uma despesa idêntica marcada como Paga no sistema
					action = 'DUPLICADO';
				} else {
					// Encontrou um correspondente pendente ou virtual
					action = 'CONCILIAR';
					countReconcile++;
				}
			} else {
				countNew++;
			}

			this.reconciledRows.push({
				...row,
				action: action,
				matchedItem: matchedItem,
				matchScore: matchScorePercent,
				// Mapeia a categoria original para a melhor encontrada nas configurações
				mappedCategory: this.fuzzyMatchCategory(row.category)
			});
		});

		// Atualiza o painel lateral de resumo
		this.updateSummaryDOM(
			this.parsedRows.length,
			exitsOnly.length,
			countReconcile,
			countNew
		);
	}

	fuzzyMatchCategory(rawCategory) {
		if (!rawCategory) return '';
		const sysCategories = this.app.database.settings.categorias?.list || [];
		if (sysCategories.length === 0) return '';

		let bestMatch = '';
		let highestScore = 0;

		sysCategories.forEach(catName => {
			const score = this.getLevenshteinSimilarity(rawCategory, catName);
			if (score > highestScore) {
				highestScore = score;
				bestMatch = catName;
			}
		});

		// Retorna a correspondente se for razoavelmente parecida, senão adota a primeira como padrão
		return highestScore >= 0.60 ? bestMatch : sysCategories[0];
	}

	updateSummaryDOM(total, filtered, reconcile, newCount) {
		const elTotal = document.getElementById('csvSummaryTotal');
		const elFiltered = document.getElementById('csvSummaryFiltered');
		const elReconcile = document.getElementById('csvSummaryReconcile');
		const elNew = document.getElementById('csvSummaryNew');

		if (elTotal) elTotal.textContent = total;
		if (elFiltered) elFiltered.textContent = filtered;
		if (elReconcile) elReconcile.textContent = reconcile;
		if (elNew) elNew.textContent = newCount;
	}

	// --- 4. RENDERIZAÇÃO DA INTERFACE DE PREVIEW ---

	renderPreview() {
		const container = document.getElementById('csv-preview-container');
		const tbody = document.getElementById('csvPreviewList');
		if (!container || !tbody) return;

		tbody.innerHTML = '';
		container.classList.remove('hidden');

		// Pega as categorias configuradas
		const categorias = this.app.database.settings.categorias?.list || [];

		this.reconciledRows.forEach((row, index) => {
			const tr = document.createElement('tr');
			tr.className = `hover:bg-gray-800/40 border-b border-gray-700/50 transition-colors ${row.action === 'DUPLICADO' ? 'opacity-60 bg-red-950/5' : ''}`;
			
			// Define classes do badge do status de conciliação
			let badgeClass = 'bg-green-500/10 text-green-400 border border-green-500/20';
			let badgeText = 'Nova Despesa';
			let badgeIcon = 'fa-plus-circle';
			let isChecked = 'checked';
			let tooltip = 'Não há despesas similares registradas. Uma nova despesa será criada.';

			if (row.action === 'CONCILIAR') {
				badgeClass = 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
				badgeIcon = 'fa-sync-alt';
				badgeText = 'Conciliar';
				isChecked = 'checked';
				tooltip = `Assimilado com o item "${row.matchedItem.description}" do sistema (${row.matchScore}% de similaridade). Marcará este item como pago.`;
			} else if (row.action === 'DUPLICADO') {
				badgeClass = 'bg-red-500/10 text-red-400 border border-red-500/20';
				badgeIcon = 'fa-exclamation-triangle';
				badgeText = 'Já Lançada (Ignorar)';
				isChecked = '';
				tooltip = `Uma despesa paga idêntica ("${row.matchedItem.description}") já foi registrada neste mês. Desmarcado por segurança.`;
			}

			// Dropdown de Categorias
			let categorySelect = `<select class="glass-select py-1 px-2 text-xs w-full" id="row-cat-${index}">`;
			categorias.forEach(cat => {
				const selected = cat === row.mappedCategory ? 'selected' : '';
				categorySelect += `<option value="${cat}" ${selected}>${cat}</option>`;
			});
			categorySelect += `</select>`;

			// Dropdown de Bancos
			let bankSelect = `<select class="glass-select py-1 px-2 text-xs w-full" id="row-bank-${index}">
				<option value="">Nenhum...</option>`;
			this.supportedBanks.forEach(bank => {
				const selected = bank === row.bank ? 'selected' : '';
				bankSelect += `<option value="${bank}" ${selected}>${bank}</option>`;
			});
			bankSelect += `</select>`;

			const formattedDate = row.paymentDate ? Utils.formatDate(row.paymentDate) : '—';
			
			tr.innerHTML = `
				<td class="p-3 text-center">
					<input type="checkbox" id="row-check-${index}" class="csv-row-checkbox rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500 h-4 w-4" ${isChecked} onchange="window.App.csvHandler.updateCheckedCount()">
				</td>
				<td class="p-3 text-gray-300 text-xs">${formattedDate}</td>
				<td class="p-3">
					<input type="text" value="${Utils.sanitizeText(row.description)}" class="bg-transparent border-b border-transparent focus:border-indigo-500 text-white text-xs w-full focus:outline-none py-0.5" id="row-desc-${index}">
				</td>
				<td class="p-3">${categorySelect}</td>
				<td class="p-3">${bankSelect}</td>
				<td class="p-3">
					<input type="text" value="R$ ${row.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}" class="bg-transparent border-b border-transparent focus:border-indigo-500 text-right text-gray-200 font-bold text-xs w-24 focus:outline-none py-0.5" id="row-val-${index}" oninput="window.App.csvHandler.handleCurrencyInput(event, ${index})">
				</td>
				<td class="p-3">
					<div class="flex items-center gap-2">
						<span class="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-help ${badgeClass}" title="${tooltip}">
							<i class="fas ${badgeIcon}"></i> ${badgeText}
						</span>
						${row.action === 'CONCILIAR' ? `<span class="text-[10px] text-gray-500 font-medium">(${row.matchScore}% similaridade)</span>` : ''}
					</div>
				</td>
			`;

			tbody.appendChild(tr);
		});

		this.updateCheckedCount();
	}

	handleCurrencyInput(e, index) {
		Utils.applyCurrencyMask(e);
		// Atualiza o valor correspondente no array local para quando for gravar
		const cleanVal = Utils.parseNumber(e.target.value);
		if (!isNaN(cleanVal)) {
			this.reconciledRows[index].value = cleanVal;
		}
	}

	toggleAllCheckboxes(checked) {
		document.querySelectorAll('.csv-row-checkbox').forEach(cb => {
			cb.checked = checked;
		});
		
		const headerCheckbox = document.getElementById('csvHeaderCheckbox');
		if (headerCheckbox) headerCheckbox.checked = checked;

		this.updateCheckedCount();
	}

	updateCheckedCount() {
		const checkedCount = document.querySelectorAll('.csv-row-checkbox:checked').length;
		const elCount = document.getElementById('csvCheckedCount');
		if (elCount) elCount.textContent = checkedCount;
	}

	// --- 5. EXECUÇÃO DA GRAVAÇÃO NO FIREBASE ---

	async saveImport() {
		const selectedRows = [];
		const checkboxes = document.querySelectorAll('.csv-row-checkbox');
		
		checkboxes.forEach((cb, index) => {
			if (cb.checked) {
				// Coleta as alterações que o usuário fez nos campos editáveis da tabela
				const descInput = document.getElementById(`row-desc-${index}`);
				const catSelect = document.getElementById(`row-cat-${index}`);
				const bankSelect = document.getElementById(`row-bank-${index}`);
				const valInput = document.getElementById(`row-val-${index}`);

				const updatedRow = {
					...this.reconciledRows[index],
					description: descInput ? Utils.sanitizeText(descInput.value) : this.reconciledRows[index].description,
					category: catSelect ? catSelect.value : this.reconciledRows[index].category,
					bank: bankSelect ? bankSelect.value : this.reconciledRows[index].bank,
					value: valInput ? Utils.parseNumber(valInput.value) : this.reconciledRows[index].value
				};

				selectedRows.push(updatedRow);
			}
		});

		if (selectedRows.length === 0) {
			Utils.showToast('Nenhuma despesa selecionada para importação.', 'warning');
			return;
		}

		// Confirmação
		const confirmMsg = `Deseja realmente importar / conciliar as ${selectedRows.length} despesas selecionadas?`;
		const ok = await Utils.confirm(confirmMsg);
		if (!ok) return;

		// Loader de processamento
		const submitBtn = document.getElementById('csvSubmitImportBtn');
		const originalText = submitBtn.innerHTML;
		submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gravando Dados...';
		submitBtn.disabled = true;

		let successCount = 0;
		let reconcileCount = 0;

		try {
			for (const row of selectedRows) {
				const despesaData = {
					description: row.description,
					category: row.category,
					bank: row.bank || null,
					dueDate: row.dueDate || this.currentMonthFilter + '-05',
					value: row.value,
					status: 'Paga',
					paymentDate: row.paymentDate || new Date().toISOString().split('T')[0],
					isFixed: row.matchedItem ? row.matchedItem.isFixed || false : false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				};

				if (row.action === 'CONCILIAR' && row.matchedItem) {
					// Caso seja conciliação
					if (row.matchedItem.isVirtual) {
						// Era uma custa fixa "Virtual" (recorrente template). Adiciona registro de despesa real "Paga".
						const success = await this.app.firebaseService.addOfficeExpense({
							...despesaData,
							isFixed: true
						});
						if (success) {
							successCount++;
							reconcileCount++;
						}
					} else {
						// Era uma despesa real cadastrada como Pendente. Atualiza para Pago no Firestore.
						const success = await this.app.firebaseService.updateOfficeExpense(row.matchedItem.id, {
							status: 'Paga',
							paymentDate: despesaData.paymentDate,
							bank: despesaData.bank,
							value: despesaData.value, // Atualiza valor se tiver alterado
							updatedAt: new Date().toISOString()
						});
						if (success) {
							successCount++;
							reconcileCount++;
						}
					}
				} else {
					// Caso seja despesa nova
					const success = await this.app.firebaseService.addOfficeExpense(despesaData);
					if (success) {
						successCount++;
					}
				}
			}

			// Mensagem final de sucesso
			Utils.showToast(`Importação completa! ${successCount} despesas importadas (${reconcileCount} conciliadas).`, 'success');
			
			// Limpa estados
			this.parsedRows = [];
			this.reconciledRows = [];
			
			// Redireciona de volta para a Gestão Administrativa
			this.app.showPage('page-escritorio');
			
		} catch (error) {
			console.error("Erro no processamento da importação:", error);
			Utils.showToast('Erro ao realizar gravação em lote. Entre em contato com o suporte.', 'error');
		} finally {
			submitBtn.innerHTML = originalText;
			submitBtn.disabled = false;
		}
	}
}
