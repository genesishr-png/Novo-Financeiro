import { Utils } from './utils.js';

export class DOMBuilder {
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

	createExitoCard(contract) {
		const taxaExitoDisplay = contract.successFee || '[Não definido]';

		const card = this.buildElement('div', { className: 'dark-card shadow-lg p-5 rounded-xl transition-all duration-200 hover:-translate-y-1 border-l-4 border-indigo-500 w-80 flex-shrink-0 flex flex-col' });
		
		const header = this.buildElement('div', { className: 'mb-4' });
		header.append(this.buildElement('p', { className: 'font-bold text-white text-lg leading-tight', text: contract.clientName }));

		const services = (contract.serviceTypes || []).map(s => s.name).join(', ');
		header.append(this.buildElement('p', { className: 'text-xs text-gray-400 mt-1', text: services }));
		card.append(header);

		const infoDiv = this.buildElement('div', { className: 'flex-1 flex flex-col justify-center my-6 p-4 bg-gray-900/30 rounded-lg border border-gray-700/50' });
		infoDiv.append(this.buildElement('p', { className: 'text-[10px] text-indigo-300 font-bold uppercase tracking-widest mb-2', text: 'Bonificação Pendente' }));
		infoDiv.append(this.buildElement('p', { className: 'text-lg font-medium text-white leading-relaxed break-words', text: taxaExitoDisplay }));
		card.append(infoDiv);

		const button = this.buildElement('button', {
			className: 'w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold py-3 px-4 rounded-xl text-sm shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-auto',
			html: '<i class="fas fa-gavel"></i> Registar Recebimento'
		});
		button.onclick = () => window.App.openExitoModal(contract.id);
		card.append(button);

		return card;
	}

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

	createParcelaCard({ contract, parcel, index, diffDays, valorCorrigido, isVencida }) {
		const valorOriginalDisplay = Utils.formatCurrency(parcel.value);
		const valorCorrigidoDisplay = Utils.formatCurrency(valorCorrigido);

		const isDiligencia = parcel.isDiligencia || false;
		const paidBy = parcel.paidBy || 'Cliente';
		const isReimbursed = parcel.isReimbursed || false;

		// [MUDANÇA v5.9] Cores e classes dinâmicas
		let cardClasses = isVencida ? 'parcel-card-vencida' : 'parcel-card-avencer';
		let borderLeftColor = isVencida ? 'border-l-red-500' : 'border-l-yellow-500';

		if (isDiligencia) {
			cardClasses = 'border-indigo-500/30 bg-indigo-900/10';
			borderLeftColor = 'border-l-indigo-500';
		}

		const card = this.buildElement('div', { className: `dark-card shadow-lg p-5 rounded-lg border-l-4 ${borderLeftColor} ${cardClasses} transition-all duration-200 hover:-translate-y-1 hover:shadow-xl` });

		const header = this.buildElement('div', { className: 'flex justify-between items-start mb-1' });
		header.append(this.buildElement('p', { className: 'font-bold text-lg text-white', text: contract.clientName }));

		if (isDiligencia) {
			header.append(this.buildElement('span', { className: 'text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full font-bold', text: 'DILIGÊNCIA' }));
		}
		card.append(header);

		const services = (contract.serviceTypes || []).map(s => s.name).join(', ');
		const subText = isDiligencia ? (parcel.description || 'Custas Extras') : `${services} - Parcela ${parcel.number}/${contract.parcels.length || 1}`;
		card.append(this.buildElement('p', { className: 'text-sm text-gray-400 mb-3', text: subText }));

		const details = this.buildElement('div', { className: 'border-t border-gray-700 pt-3 mt-3 space-y-2' });

		// Valor e Vencimento
		if (isVencida && !isDiligencia) {
			details.innerHTML = `
					<div class="flex justify-between items-center text-sm">
						<span class="text-gray-400">Valor Original:</span>
						<span class="font-medium text-gray-400 line-through">${valorOriginalDisplay}</span>
					</div>
					<div class="flex justify-between items-center">
						<span class="text-sm text-white">Valor Corrigido:</span>
						<span class="font-semibold text-lg parcel-value text-red-400">${valorCorrigidoDisplay}</span>
					</div>`;
		} else {
			const labelColor = isDiligencia ? 'text-indigo-300' : 'text-white';
			details.innerHTML = `
					<div class="flex justify-between items-center">
						<span class="text-sm ${labelColor}">Valor:</span>
						<span class="font-semibold text-lg parcel-value">${valorOriginalDisplay}</span>
					</div>`;
		}

		details.innerHTML += `
				<div class="flex justify-between items-center text-sm">
					<span class="text-gray-400">Vencimento:</span>
					<span class="font-medium text-gray-300">${Utils.formatDate(parcel.dueDate)}</span>
				</div>`;

		// Info de Diligência (Pagador e Reembolso)
		if (isDiligencia) {
			const pagadorIcon = (paidBy === 'Cliente' || paidBy === '') ? '<i class="fas fa-user-tie"></i>' : '<i class="fas fa-building"></i>';
			const reimbursedText = isReimbursed ? '<i class="fas fa-check"></i> REEMBOLSADO' : '<i class="fas fa-exclamation-triangle"></i> REEMBOLSO PENDENTE';
			const reimbursedClass = isReimbursed 
				? 'bg-green-500/20 text-green-400 border border-green-500/30' 
				: 'bg-red-500/20 text-red-400 border border-red-500/30';

			details.innerHTML += `
					<div class="flex flex-col gap-1 text-xs mt-2 pt-2 border-t border-gray-800">
						<div class="flex justify-between items-center">
							<span class="text-gray-500">Pagador: ${pagadorIcon} ${paidBy}</span>
							${(paidBy === 'Escritório' || paidBy === 'Escritrio') ? `<span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${reimbursedClass}">${reimbursedText}</span>` : ''}
						</div>
					</div>`;
		} else {
			// Info de Atraso para parcelas normais
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
		}

		card.append(details);

		const footer = this.buildElement('div', { className: 'mt-4 flex gap-2' });

		const isPaidByOffice = paidBy && (paidBy.toString().toLowerCase().includes('escritorio') || paidBy.toString().toLowerCase().includes('escritório'));

		// Botões de Ação
		if (isDiligencia && isPaidByOffice) {
			const reimburseBtn = this.buildElement('button', {
				className: `flex-1 ${isReimbursed ? 'bg-gray-700 hover:bg-gray-600' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-semibold py-2 px-3 rounded-lg shadow-lg transition-all text-xs flex items-center justify-center gap-2`,
				html: `<i class="fas ${isReimbursed ? 'fa-undo' : 'fa-hand-holding-usd'}"></i> ${isReimbursed ? 'Estornar Reembolso' : 'Confirmar Reembolso'}`
			});
			reimburseBtn.onclick = () => window.App.toggleReimbursementStatus(contract.id, index);
			footer.append(reimburseBtn);
		} else if (!isDiligencia) {
			const payBtn = this.buildElement('button', {
				className: 'flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-2 px-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2',
				html: '<i class="fas fa-check"></i> Pagar'
			});
			payBtn.onclick = () => window.App.openPaymentModal(contract.id, index);
			footer.append(payBtn);
		}

		const editBtn = this.buildElement('button', {
			className: 'flex-shrink-0 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center gap-2',
			html: '<i class="fas fa-pencil-alt"></i>'
		});
		editBtn.title = "Editar Contrato";
		editBtn.onclick = () => window.App.openContractModal(contract.id);

		footer.append(editBtn);
		card.append(footer);

		return card;
	}

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
	createSettingListItem(name, type = 'advogado') {
		const item = this.buildElement('div', { className: 'setting-list-item' });
		item.innerHTML = `
					<span class="font-medium">${Utils.sanitizeText(name)}</span>
					<button class="setting-list-remove-btn" title="Remover ${Utils.sanitizeText(name)}">&times;</button>
				`;

		item.querySelector('.setting-list-remove-btn').onclick = () => {
			if (type === 'categoria') window.App.handleRemoveCategoria(name); else window.App.handleRemoveAdvogado(name);
		};
		return item;
	}

	createFixedCostListItem(costObj) {
		const item = this.buildElement('div', { className: 'setting-list-item' });
		item.innerHTML = `
			<div class="flex flex-col">
				<span class="font-bold text-white text-sm">${Utils.sanitizeText(costObj.name)}</span>
				<span class="text-xs text-gray-400">${Utils.sanitizeText(costObj.category)} - ${Utils.formatCurrency(costObj.value)}</span>
			</div>
			<button class="setting-list-remove-btn" title="Remover">&times;</button>
		`;

		item.querySelector('.setting-list-remove-btn').onclick = () => {
			window.App.handleRemoveCustaFixa(costObj.id);
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