export class CorrectionCalculator {
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