(function (NC) {
  'use strict';

  var desc = NC.desc;

  function sentence(role, en, zh, steps) {
    var item = desc.sentence(role, en, zh);
    item.steps = steps || [];
    item.focus = item.steps.slice();
    return item;
  }

  desc.process = function (dataset, level, mode) {
    var passive = mode && mode.voice === 'passive';
    var sentences = [];

    if (level === 'A2') {
      sentences.push(sentence('overview', 'The diagram shows how a takeout order reaches the customer.', '这张图展示外卖订单怎样送到顾客手里。'));
      if (passive) {
        sentences.push(sentence('step', 'First, the order is placed in the app and paid online.', '首先，订单在应用里提交并在线支付。', ['order']));
        sentences.push(sentence('step', 'Next, it is confirmed by the restaurant, which starts cooking.', '接着，订单由餐厅确认，随后开始制作。', ['confirm']));
        sentences.push(sentence('step', 'Then it is assigned to a courier and picked up from the restaurant.', '然后，订单被分配给骑手，并从餐厅取走。', ['assign', 'pickup']));
        sentences.push(sentence('step', 'Finally, the food is delivered to the customer\'s building.', '最后，餐品被送到顾客所在楼栋。', ['deliver']));
        sentences.push(sentence('step', 'The order is handed to the customer, who rates the courier.', '订单交给顾客，顾客随后给骑手评分。', ['handoff']));
      } else {
        sentences.push(sentence('step', 'First, the customer places the order in the app and pays online.', '首先，顾客在应用里下单并在线支付。', ['order']));
        sentences.push(sentence('step', 'Next, the restaurant confirms the order and starts cooking.', '接着，餐厅确认订单并开始制作。', ['confirm']));
        sentences.push(sentence('step', 'Then the platform assigns a courier, who picks up the food.', '然后平台派单，骑手到餐厅取餐。', ['assign', 'pickup']));
        sentences.push(sentence('step', 'Finally, the courier rides to the customer\'s building and hands over the order.', '最后，骑手骑到顾客楼下并交付订单。', ['deliver', 'handoff']));
        sentences.push(sentence('step', 'The customer receives the food and rates the courier.', '顾客收到餐品并给骑手评分。', ['handoff']));
      }
      return { sentences: sentences, stats: { steps: dataset.steps.length } };
    }

    if (level === 'B1') {
      sentences.push(sentence('overview', 'The process moves from a customer order to a completed delivery.', '整个过程从顾客下单开始，到订单送达结束。'));
      if (passive) {
        sentences.push(sentence('step', 'An order is first placed in the app and paid online.', '订单首先在应用里提交并在线支付。', ['order']));
        sentences.push(sentence('step', 'It is then confirmed by the restaurant, which begins preparing the food.', '随后订单由餐厅确认，餐厅开始备餐。', ['confirm']));
        sentences.push(sentence('step', 'Once the food is ready, the order is assigned to a nearby courier and collected.', '餐品准备好后，订单被分配给附近的骑手并取走。', ['assign', 'pickup']));
        sentences.push(sentence('step', 'The food is then carried to the customer\'s building and handed over.', '然后餐品被送到顾客所在楼栋并完成交付。', ['deliver', 'handoff']));
        sentences.push(sentence('step', 'The order is received by the customer, who rates the courier in the app.', '顾客收到订单，并在应用里给骑手评分。', ['handoff']));
      } else {
        sentences.push(sentence('step', 'The customer first places an order in the app and pays online.', '顾客先在应用里下单并在线支付。', ['order']));
        sentences.push(sentence('step', 'The restaurant then confirms the order and begins preparing the food.', '餐厅随后确认订单并开始备餐。', ['confirm']));
        sentences.push(sentence('step', 'Once the food is ready, the platform assigns it to a nearby courier, who collects it.', '餐品备好后，平台把订单派给附近的骑手，由骑手取餐。', ['assign', 'pickup']));
        sentences.push(sentence('step', 'The courier then rides to the customer\'s building and hands over the order.', '骑手随后骑到顾客楼下并交付订单。', ['deliver', 'handoff']));
        sentences.push(sentence('step', 'The customer receives the food and rates the courier in the app.', '顾客收到餐品，并在应用里给骑手评分。', ['handoff']));
      }
      return { sentences: sentences, stats: { steps: dataset.steps.length } };
    }

    if (level === 'B2') {
      sentences.push(sentence('overview', 'The diagram breaks the delivery journey into a clear sequence of stages.', '流程图把配送过程拆成一条清晰的阶段链。'));
      if (passive) {
        sentences.push(sentence('step', 'The process begins when an order is placed in the app and paid for online.', '流程从订单在应用里提交并在线支付开始。', ['order']));
        sentences.push(sentence('step', 'The order is confirmed by the restaurant, which then starts preparing the food.', '订单由餐厅确认，随后餐厅开始备餐。', ['confirm']));
        sentences.push(sentence('step', 'Once the food is ready, the order is assigned to a nearby courier and collected from the restaurant.', '餐品备好后，订单被分配给附近的骑手，并从餐厅取走。', ['assign', 'pickup']));
        sentences.push(sentence('step', 'The food is carried to the customer\'s building, where it is handed over at the entrance.', '餐品被送到顾客所在楼栋，并在入口完成交付。', ['deliver', 'handoff']));
        sentences.push(sentence('step', 'Finally, the order is received by the customer, and the courier is rated in the app.', '最后，顾客收到订单，并在应用里给骑手评分。', ['handoff']));
      } else {
        sentences.push(sentence('step', 'The process begins when a customer places an order in the app and pays for it online.', '流程从顾客在应用里下单并在线支付开始。', ['order']));
        sentences.push(sentence('step', 'The restaurant confirms the order and then starts preparing the food.', '餐厅确认订单，随后开始备餐。', ['confirm']));
        sentences.push(sentence('step', 'Once the food is ready, the platform assigns the order to a nearby courier, who collects it from the restaurant.', '餐品备好后，平台把订单派给附近的骑手，骑手到餐厅取餐。', ['assign', 'pickup']));
        sentences.push(sentence('step', 'The courier carries the food to the customer\'s building and hands it over at the entrance.', '骑手把餐品送到顾客所在楼栋，并在入口交付。', ['deliver', 'handoff']));
        sentences.push(sentence('step', 'Finally, the customer receives the order and rates the courier in the app.', '最后，顾客收到订单，并在应用里给骑手评分。', ['handoff']));
      }
      return { sentences: sentences, stats: { steps: dataset.steps.length } };
    }

    sentences.push(sentence('overview', 'The delivery process falls into three phases: ordering, preparation, and hand-off.', '配送过程可分为三个阶段：下单、备餐和交付。'));
    if (passive) {
      sentences.push(sentence('step', 'In the first phase, an order is placed in the app and paid for online.', '第一阶段，订单在应用里提交并在线支付。', ['order']));
      sentences.push(sentence('step', 'It is then confirmed by the restaurant, which begins preparing the food.', '随后订单由餐厅确认，餐厅开始备餐。', ['confirm']));
      sentences.push(sentence('step', 'In the second phase, the finished food is assigned to a nearby courier and collected from the restaurant.', '第二阶段，做好的餐品被分配给附近的骑手，并从餐厅取走。', ['assign', 'pickup']));
      sentences.push(sentence('step', 'In the final phase, the order is carried to the customer\'s building and handed over at the entrance.', '最后阶段，订单被送到顾客所在楼栋，并在入口交付。', ['deliver', 'handoff']));
      sentences.push(sentence('step', 'The customer receives the food and rates the courier in the app.', '顾客收到餐品，并在应用里给骑手评分。', ['handoff']));
    } else {
      sentences.push(sentence('step', 'In the first phase, a customer places an order in the app and pays for it online.', '第一阶段，顾客在应用里下单并在线支付。', ['order']));
      sentences.push(sentence('step', 'The restaurant confirms the order and begins preparing the food.', '餐厅确认订单并开始备餐。', ['confirm']));
      sentences.push(sentence('step', 'In the second phase, the platform assigns the finished food to a nearby courier, who collects it from the restaurant.', '第二阶段，平台把做好的餐品派给附近的骑手，骑手到餐厅取餐。', ['assign', 'pickup']));
      sentences.push(sentence('step', 'In the final phase, the courier carries the order to the customer\'s building and hands it over at the entrance.', '最后阶段，骑手把订单送到顾客所在楼栋，并在入口交付。', ['deliver', 'handoff']));
      sentences.push(sentence('step', 'The customer receives the food and rates the courier in the app.', '顾客收到餐品，并在应用里给骑手评分。', ['handoff']));
    }
    sentences.push(sentence('takeaway', 'The sequence is strict: each stage depends on the one before it, so a delay at any point pushes the delivery back.', '顺序很严格：每个阶段都依赖前一步，任何一环延误都会推迟送达。', []));
    return { sentences: sentences, stats: { steps: dataset.steps.length } };
  };
})(window.NPESLCharts);
