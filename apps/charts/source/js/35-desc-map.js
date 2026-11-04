(function (NC) {
  'use strict';

  var desc = NC.desc;

  function sentence(role, en, zh, focus) {
    var item = desc.sentence(role, en, zh);
    item.focus = focus || [];
    return item;
  }

  function feature(dataset, id) {
    return dataset.features.filter(function (item) { return item.id === id; })[0];
  }

  function lower(text) {
    return NC.fmt.lowerFirst(text);
  }

  desc.map = function (dataset, level) {
    var factory = feature(dataset, 'factory');
    var parking = feature(dataset, 'parking');
    var shops = feature(dataset, 'shops');
    var station = feature(dataset, 'station');
    var school = feature(dataset, 'school');
    var houses = feature(dataset, 'houses');
    var sentences = [];

    if (level === 'A2') {
      sentences.push(sentence('overview', 'The maps show Riverside in 2015 and 2026.', '这两张图展示滨江片区 2015 年和 2026 年的样子。'));
      sentences.push(sentence(
        'change',
        'The factory is now apartment towers, and the parking lot is now a park.',
        '工厂现在变成了公寓楼，停车场现在变成了公园。',
        ['factory', 'parking']
      ));
      sentences.push(sentence(
        'change',
        'There is a new metro station in the southeast.',
        '东南角新建了一座地铁站。',
        ['station']
      ));
      sentences.push(sentence(
        'unchanged',
        'The school and the houses are the same.',
        '学校和住宅区保持原样。',
        ['school', 'houses']
      ));
      return { sentences: sentences, stats: { changed: 3, unchanged: 2 } };
    }

    if (level === 'B1') {
      sentences.push(sentence('overview', 'The maps show how Riverside changed between 2015 and 2026.', '这两张图展示滨江片区在 2015 到 2026 年间的变化。'));
      sentences.push(sentence(
        'change',
        'The textile factory in the northwest was replaced by apartment towers, and the parking lot in the north became a park.',
        '西北角的纺织厂被公寓楼取代，北部的停车场变成了公园。',
        ['factory', 'parking']
      ));
      sentences.push(sentence(
        'change',
        'The corner shops in the northeast were replaced by a shopping mall.',
        '东北角的街角小店被一座商场取代。',
        ['shops']
      ));
      sentences.push(sentence(
        'change',
        'A new metro station was built in the southeast.',
        '东南角新建了一座地铁站。',
        ['station']
      ));
      sentences.push(sentence(
        'unchanged',
        'The primary school and the housing estate remained unchanged.',
        '小学和住宅区保持不变。',
        ['school', 'houses']
      ));
      return { sentences: sentences, stats: { changed: 4, unchanged: 2 } };
    }

    if (level === 'B2') {
      sentences.push(sentence('overview', 'The two maps show the redevelopment of Riverside between 2015 and 2026.', '两张图展示了滨江片区在 2015 到 2026 年间的改造。'));
      sentences.push(sentence(
        'change',
        'The most striking change is in the northwest, where the textile factory was demolished and replaced by a row of apartment towers.',
        '最明显的变化在西北角：纺织厂被拆除，原址建起了一排公寓楼。',
        ['factory']
      ));
      sentences.push(sentence(
        'change',
        'To the north, the parking lot was converted into a public park, while the corner shops in the northeast made way for a shopping mall.',
        '北部停车场被改造成公共公园，东北角的街角小店则为一座商场让路。',
        ['parking', 'shops']
      ));
      sentences.push(sentence(
        'addition',
        'A metro station was added in the southeast, on land that was previously empty.',
        '东南角原本是空地，现在新建了地铁站。',
        ['station']
      ));
      sentences.push(sentence(
        'unchanged',
        'The primary school and the housing estate were left untouched.',
        '小学和住宅区没有被改动。',
        ['school', 'houses']
      ));
      sentences.push(sentence(
        'structure',
        'The road network and the river remained the same throughout.',
        '道路网络和河流始终保持原样。'
      ));
      return { sentences: sentences, stats: { changed: 4, unchanged: 2 } };
    }

    sentences.push(sentence('overview', 'The maps document a shift in Riverside from an industrial, low-rise district to a residential and retail one.', '两张图记录了滨江片区从工业低层区向居住和商业区转变的过程。'));
    sentences.push(sentence(
      'change',
      'The textile factory, once the largest site in the northwest, was cleared and redeveloped as apartment towers.',
      '西北角曾经最大的纺织厂被清拆，改建为公寓楼。',
      ['factory']
    ));
    sentences.push(sentence(
      'change',
      'Two other sites changed use rather than scale: the northern parking lot became a public park, and the corner shops in the northeast were absorbed into a shopping mall.',
      '另外两处改变的是用途而非规模：北部停车场变成公园，东北角的小店并入一座商场。',
      ['parking', 'shops']
    ));
    sentences.push(sentence(
      'addition',
      'The only new structure is the metro station in the southeast, which sits on a site that was empty in 2015.',
      '唯一的新增建筑是东南角的地铁站，它建在 2015 年还是一片空地的位置上。',
      ['station']
    ));
    sentences.push(sentence(
      'unchanged',
      'The school and the housing estate provide continuity, while the road layout and the river are unchanged.',
      '小学和住宅区保持了连续性，道路布局和河流也没有变化。',
      ['school', 'houses']
    ));
    sentences.push(sentence(
      'takeaway',
      'Taken together, the changes point to a district being repositioned for residents and shoppers rather than industry.',
      '总体来看，这些变化说明片区正从工业用途转向面向居民和消费者的功能。'
    ));
    return { sentences: sentences, stats: { changed: 4, unchanged: 2 } };
  };
})(window.NPESLCharts);
