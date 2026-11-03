(function (NC) {
  'use strict';

  function boot() {
    var node = document.getElementById('npesl-charts-data');
    if (!node) {
      console.error('Chart data is missing.');
      return;
    }
    var data = JSON.parse(node.textContent);
    NC.state.data = data;
    NC.state.datasets = NC.deepClone(data.labs.datasets);
    NC.state.initial = NC.deepClone(data.labs.datasets);
    NC.ui.build();
    document.documentElement.setAttribute('data-charts-ready', 'true');
    NC.test = {
      mountAll: NC.ui.mountAll,
      labs: NC.state.labs,
      state: NC.state
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.NPESLCharts);
