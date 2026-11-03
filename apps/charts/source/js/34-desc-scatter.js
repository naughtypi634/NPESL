(function (NC) {
  'use strict';

  var desc = NC.desc;

  desc.scatter = function (dataset, level) {
    var stats = NC.stats.correlation(dataset.points);
    var sentences = [];
    var positive = stats.direction === 'positive';
    var strong = stats.strength === 'strong' || stats.strength === 'very strong';
    var weak = stats.strength === 'none' || stats.strength === 'weak';
    var xLabel = dataset.x_label_en;
    var yLabel = dataset.y_label_en;
    var xLabelZh = dataset.x_label_zh;
    var yLabelZh = dataset.y_label_zh;
    var xShort = xLabel.replace(/\s*\(.*\)/, '').toLowerCase();
    var yShort = yLabel.toLowerCase();
    var xShortZh = String(xLabelZh).replace(/（.*?）/g, '');
    var strengthZh = { none: '没有明显', weak: '弱', moderate: '中等', strong: '强', 'very strong': '非常强' }[stats.strength] || '明显';
    var outlier = stats.outliers[0];

    if (level === 'A2') {
      if (weak) {
        sentences.push(desc.sentence(
          'overview',
          'Each dot is a city. The dots are spread out, so there is no clear pattern.',
          '每个点代表一个城市。点分布得很散，看不出明显规律。'
        ));
      } else {
        sentences.push(desc.sentence(
          'overview',
          'Each dot is a city. Cities that spend more on ads usually get more orders.',
          '每个点代表一个城市。广告投入更高的城市，订单通常也更多。'
        ));
      }
    } else if (level === 'B1') {
      if (weak) {
        sentences.push(desc.sentence(
          'overview',
          'The points are widely spread, so there is no clear relationship between ' + xShort + ' and ' + yShort + '.',
          '点分布得很散，' + xLabelZh + '与' + yLabelZh + '之间没有明显关系。'
        ));
      } else {
        sentences.push(desc.sentence(
          'overview',
          'There is a ' + (positive ? 'positive' : 'negative') + ' correlation between ' + xShort + ' and ' + yShort + ': cities that spend more tend to get ' + (positive ? 'more' : 'fewer') + ' orders.',
          xLabelZh + '与' + yLabelZh + '之间存在' + (positive ? '正' : '负') + '相关：投入越高的城市，订单通常' + (positive ? '越多' : '越少') + '。'
        ));
        if (outlier) {
          sentences.push(desc.sentence(
            'outlier',
            outlier.name_en + ' is an exception: it spends a lot but gets relatively ' + (positive ? 'few' : 'many') + ' orders.',
            outlier.name_zh + '是个例外：投入很高，订单却相对' + (positive ? '较少' : '较多') + '。'
          ));
        }
        if (strong) {
          sentences.push(desc.sentence(
            'strength',
            'Most cities sit close to the same ' + (positive ? 'upward' : 'downward') + ' trend.',
            '大多数城市都贴近同一条' + (positive ? '向上' : '向下') + '的趋势线。'
          ));
        }
      }
    } else if (level === 'B2') {
      if (weak) {
        sentences.push(desc.sentence(
          'overview',
          'The scatter plot shows no clear relationship between ' + xShort + ' and ' + yShort + '.',
          '散点图显示，' + xLabelZh + '与' + yLabelZh + '之间没有明显关系。'
        ));
      } else {
        sentences.push(desc.sentence(
          'overview',
          'There is a ' + stats.strength + ' ' + (positive ? 'positive' : 'negative') + ' correlation between ' + xShort + ' and ' + yShort + '.',
          xLabelZh + '与' + yLabelZh + '之间存在' + strengthZh + '的' + (positive ? '正相关' : '负相关') + '。'
        ));
        if (outlier) {
          sentences.push(desc.sentence(
            'outlier',
            outlier.name_en + ' is a clear outlier: it spends a lot but gets relatively ' + (positive ? 'few' : 'many') + ' orders.',
            outlier.name_zh + '是明显的离群点：投入很高，订单却相对' + (positive ? '较少' : '较多') + '。'
          ));
        }
      }
      if (strong) {
        sentences.push(desc.sentence(
          'strength',
          'Most points sit close to an upward trend, which makes the pattern easy to see.',
          '大多数点贴近一条向上的趋势线，规律比较明显。'
        ));
      }
    } else {
      if (weak) {
        sentences.push(desc.sentence(
          'overview',
          'The chart does not show a clear relationship between ' + xShort + ' and ' + yShort + ' in this sample.',
          '在这组样本中，图表没有显示' + xLabelZh + '与' + yLabelZh + '之间的明显关系。'
        ));
      } else {
        sentences.push(desc.sentence(
          'overview',
          'The scatter plot shows a ' + stats.strength + ' ' + (positive ? 'positive' : 'negative') + ' association between ' + xShort + ' and ' + yShort + '.',
          '散点图显示，' + xLabelZh + '与' + yLabelZh + '之间存在' + strengthZh + '的' + (positive ? '正相关' : '负相关') + '。'
        ));
        if (outlier) {
          sentences.push(desc.sentence(
            'outlier',
            outlier.name_en + ' stands apart from the rest, suggesting that the relationship is not uniform across all cities.',
            outlier.name_zh + '明显偏离其他点，说明这种关系并非在所有城市都一致。'
          ));
        }
      }
      sentences.push(desc.sentence(
        'caution',
        'This is an association in the sample, not proof that ' + xShort + ' causes more orders.',
        '这只是样本中的相关性，不能证明' + xShortZh + '导致了订单增加。'
      ));
    }

    return { sentences: sentences, stats: stats };
  };
})(window.NPESLCharts);
