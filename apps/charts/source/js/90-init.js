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
      state: NC.state,
      // One serializable view of every machine, for tests and agents.
      snapshot: function () {
        var labs = {};
        Object.keys(NC.state.labs).forEach(function (id) {
          var lab = NC.state.labs[id];
          var tip = lab.plot ? lab.plot.querySelector('.chart-tip') : null;
          labs[id] = {
            mountState: lab.mountState,
            compact: !!lab.compact,
            mode: lab.mode,
            editor: lab.plot ? lab.plot.getAttribute('data-editor') || 'closed' : null,
            activeStep: lab.processState ? lab.processState.activeStep : null,
            tableScroll: lab.tableState ? lab.tableState.shell.getAttribute('data-scroll') : null,
            tooltip: tip ? tip.getAttribute('data-visible') === 'true' : false
          };
        });
        return {
          version: NC.version,
          activeType: NC.state.activeType,
          level: NC.state.level,
          reducedMotion: NC.state.reducedMotion,
          labs: labs
        };
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.NPESLCharts);
