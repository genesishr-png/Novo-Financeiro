import { Utils } from './utils.js';

export class ReportHandler
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