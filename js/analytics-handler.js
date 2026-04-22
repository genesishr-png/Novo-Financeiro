export class AnalyticsHandler {
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