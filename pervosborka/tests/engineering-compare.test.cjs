'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../dist/engine.js');
const compare=require('../dist/engineering-compare.js');
const bank=require('../dist/bank.json');
const lab=bank.labs.find(x=>x.track==='engineering');
const clone=value=>JSON.parse(JSON.stringify(value));

// A minimal element surface exercises the real controller and native button
// events without a rendering library, network access, or a browser dependency.
function surface() {
  const listeners=new Map(),buttons=new Map();
  const document={activeElement:null};
  let outer='',body='';
  const live={textContent:''};
  const content={
    get innerHTML(){return body;},
    set innerHTML(value){
      body=value;buttons.clear();
      for(const match of value.matchAll(/<button\b([^>]*)>/g)){
        const attrs=match[1],action=attrs.match(/data-ec-action="([^"]+)"/);
        if(!action)continue;
        const button={
          dataset:{ecAction:action[1]},
          disabled:/\sdisabled(?:\s|$)/.test(attrs),
          closest(selector){return selector==='[data-ec-action]'?this:null;},
          focus(options){document.activeElement=this;this.focusOptions=options;}
        };
        buttons.set(action[1],button);
      }
    }
  };
  const container={
    ownerDocument:document,
    get innerHTML(){return outer;},
    set innerHTML(value){
      outer=value;
      const start=value.indexOf('<div class="ec-body">')+'<div class="ec-body">'.length;
      const end=value.indexOf('</div><p class="ec-live');
      content.innerHTML=value.slice(start,end);
    },
    contains(element){return [...buttons.values()].includes(element);},
    querySelector(selector){
      if(selector==='.ec-body')return content;
      if(selector==='.ec-live')return live;
      const match=selector.match(/^\[data-ec-action="([^"]+)"\]$/);
      return match?buttons.get(match[1])||null:null;
    },
    addEventListener(type,fn){listeners.set(type,fn);},
    removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);}
  };
  return {
    container,document,live,
    get body(){return body;},
    get listenerCount(){return listeners.size;},
    button(action){return buttons.get(action);},
    click(action){
      const target=buttons.get(action);assert.ok(target,'existing action '+action);
      target.focus();
      let prevented=false;
      listeners.get('click')?.({target,preventDefault(){prevented=true;}});
      return prevented;
    },
    foreignClick(){
      let prevented=false;
      listeners.get('click')?.({target:{dataset:{ecAction:'capture'},closest(){return this;}},preventDefault(){prevented=true;}});
      return prevented;
    }
  };
}

test('All 25 valid variants exactly match the existing model, bank thresholds and gradeLab',()=>{
  const feasible=[];
  for(let thickness=1;thickness<=5;thickness++)for(let ribs=0;ribs<=4;ribs++){
    const draft={thickness,ribs},readout=compare.evaluate(draft),grade=E.gradeLab(lab,draft);
    assert.deepEqual(readout.values,grade.extra);
    assert.deepEqual(readout.conditions.map(x=>x.passed),grade.criteria.map(x=>x.passed));
    assert.equal(readout.passedCount,grade.score);
    for(const metric of lab.config.metrics){
      const value=Object.entries(metric.coefficients).reduce((sum,[key,coefficient])=>sum+coefficient*draft[key],0);
      assert.equal(readout.values[metric.id],value);
      assert.equal(readout.conditions.find(x=>x.id===metric.id).passed,metric.op==='>='?value>=metric.threshold:value<=metric.threshold);
    }
    if(readout.passedCount===3)feasible.push([thickness,ribs]);
  }
  assert.deepEqual(feasible,[[2,4],[3,3]]);
});

test('Reference and current variant require integer numeric parameters within the mission bounds',()=>{
  const invalid=[null,undefined,[],{},'2,4',{thickness:'2',ribs:4},{thickness:2,ribs:'4'},{thickness:0,ribs:4},{thickness:6,ribs:4},{thickness:2,ribs:-1},{thickness:2,ribs:5},{thickness:2.5,ribs:3},{thickness:3,ribs:1.5},{thickness:NaN,ribs:2},{thickness:2,ribs:Infinity}];
  for(const draft of invalid)assert.equal(compare.evaluate(draft),null);
  assert.deepEqual(compare.evaluate({thickness:1,ribs:0}).values,{strength:2,cost:3,weight:4});
  for(const reference of invalid){
    const env=surface(),controller=compare.mount(env.container,{draft:{thickness:1,ribs:0},view:{reference}});
    assert.deepEqual(controller.getView(),{reference:null});
    assert.equal(env.button('apply').disabled,true);
    controller.destroy();
  }
});

test('The threshold equality cases are included for all three conditions',()=>{
  assert.equal(compare.evaluate({thickness:3,ribs:3}).values.strength,15);
  assert.equal(compare.evaluate({thickness:3,ribs:3}).conditions[0].passed,true);
  assert.equal(compare.evaluate({thickness:4,ribs:2}).values.cost,16);
  assert.equal(compare.evaluate({thickness:4,ribs:2}).conditions[1].passed,true);
  assert.equal(compare.evaluate({thickness:3,ribs:4}).values.weight,16);
  assert.equal(compare.evaluate({thickness:3,ribs:4}).conditions[2].passed,true);
});

test('Capturing A makes an independent snapshot; B changes and caller mutation do not alter it',()=>{
  const env=surface(),initial={thickness:2,ribs:4},controller=compare.mount(env.container,{draft:initial,onApply(){}});
  initial.thickness=5;
  assert.equal(env.click('capture'),true);
  assert.deepEqual(controller.getView(),{reference:{thickness:2,ribs:4}});
  const next={thickness:3,ribs:3};controller.update(next);next.ribs=0;
  const view=controller.getView();view.reference.thickness=5;
  assert.deepEqual(controller.getView(),{reference:{thickness:2,ribs:4}});
  assert.match(env.body,/Учебная схема B: толщина 3 мм, рёбер 3/);
  assert.match(env.body,/class="ec-delta">-1</);
  assert.match(env.body,/class="ec-delta">\+1</);
  assert.match(env.body,/class="ec-delta">\+3</);
  assert.match(env.live.textContent,/прочность 15, стоимость 15, масса 15/);
  assert.equal(env.document.activeElement,env.button('capture'));
  assert.deepEqual(env.button('capture').focusOptions,{preventScroll:true});
  controller.destroy();
});

test('A snapshot restores across mounts, discards unexpected fields and may be deliberately replaced',()=>{
  const saved={reference:{thickness:3,ribs:3,score:999}},env=surface();
  const controller=compare.mount(env.container,{draft:{thickness:4,ribs:2},view:saved});
  saved.reference.ribs=0;
  assert.deepEqual(controller.getView(),{reference:{thickness:3,ribs:3}});
  assert.match(env.body,/Обновить вариант A/);
  env.click('capture');
  assert.deepEqual(controller.getView(),{reference:{thickness:4,ribs:2}});
  const restored=controller.getView();controller.destroy();
  const nextEnv=surface(),next=compare.mount(nextEnv.container,{draft:{thickness:1,ribs:0},view:restored});
  restored.reference.ribs=4;
  assert.deepEqual(next.getView(),{reference:{thickness:4,ribs:2}});
  next.destroy();
});

test('Applying A emits only an independent draft and leaves recorded first/last checks and attempts intact',()=>{
  const draft={thickness:1,ribs:0},grade=E.gradeLab(lab,draft);
  const state={drafts:{engineering:draft},labs:{engineering:{first:grade,last:grade,firstDraft:clone(draft),lastDraft:clone(draft),attempts:2,firstHadHint:false,hintUsed:true}}};
  const oldChecks=clone(state.labs),env=surface(),received=[];
  const controller=compare.mount(env.container,{draft:state.drafts.engineering,view:{reference:{thickness:2,ribs:4}},onApply(snapshot){received.push(snapshot);state.drafts.engineering=clone(snapshot);snapshot.ribs=0;}});
  env.click('apply');
  assert.equal(received.length,1);
  assert.deepEqual(state.drafts.engineering,{thickness:2,ribs:4});
  assert.deepEqual(controller.getView(),{reference:{thickness:2,ribs:4}});
  assert.deepEqual(state.labs,oldChecks);
  assert.match(env.body,/Учебная схема B: толщина 2 мм, рёбер 4/);
  assert.equal(env.document.activeElement,env.button('apply'));
  assert.match(env.live.textContent,/Для новой проверенной попытки/);
  controller.destroy();
});

test('Clear removes only A, preserves B and moves keyboard focus to the available capture action',()=>{
  const env=surface(),controller=compare.mount(env.container,{draft:{thickness:3,ribs:3},view:{reference:{thickness:2,ribs:4}},onApply(){}});
  env.click('clear');
  assert.deepEqual(controller.getView(),{reference:null});
  assert.match(env.body,/Учебная схема B: толщина 3 мм, рёбер 3/);
  assert.equal(env.button('apply').disabled,true);
  assert.equal(env.button('clear').disabled,true);
  assert.equal(env.document.activeElement,env.button('capture'));
  assert.match(env.live.textContent,/Текущий вариант B остался/);
  controller.destroy();
});

test('Invalid B cannot be captured and absent callback cannot apply; foreign actions are ignored',()=>{
  const env=surface(),controller=compare.mount(env.container,{draft:{thickness:2,ribs:4},view:{reference:{thickness:3,ribs:3}}});
  assert.equal(env.button('apply').disabled,true);
  assert.equal(env.click('apply'),false);
  controller.update({thickness:6,ribs:0});
  assert.equal(env.button('capture').disabled,true);
  assert.equal(env.click('capture'),false);
  assert.equal(env.foreignClick(),false);
  assert.deepEqual(controller.getView(),{reference:{thickness:3,ribs:3}});
  assert.match(env.live.textContent,/недоступны для сравнения/);
  assert.match(env.body,/Нужны целые t от 1 до 5 и r от 0 до 4/);
  controller.update({thickness:1,ribs:0});
  assert.equal(env.button('capture').disabled,false);
  controller.destroy();
});

test('Live updates retain an outside focus and a stable announcement node; unchanged B does not rerender',()=>{
  const env=surface(),controller=compare.mount(env.container,{draft:{thickness:1,ribs:0}});
  const outside={id:'host-thickness-slider'};env.document.activeElement=outside;
  const live=env.live,capture=env.button('capture');
  controller.update({thickness:1,ribs:0});
  assert.equal(env.button('capture'),capture);
  controller.update({thickness:2,ribs:0});
  assert.equal(env.document.activeElement,outside);
  assert.equal(env.live,live);
  assert.match(live.textContent,/прочность 4, стоимость 6, масса 8/);
  controller.destroy();
});

test('Destroy detaches the interaction and permits a synchronous host remount during apply',()=>{
  const env=surface();let controller;
  controller=compare.mount(env.container,{draft:{thickness:1,ribs:0},view:{reference:{thickness:3,ribs:3}},onApply(){controller.destroy();}});
  env.click('apply');
  assert.equal(env.listenerCount,0);
  const body=env.body,view=controller.getView();
  controller.update({thickness:5,ribs:4});controller.destroy();
  assert.equal(env.body,body);
  assert.deepEqual(controller.getView(),view);
  assert.equal(env.click('capture'),false);
});

test('Markup exposes units, accessible conditions and neutral deltas without host scoring actions',()=>{
  const markup=compare.html({draft:{thickness:3,ribs:3},view:{reference:{thickness:2,ribs:4}}});
  assert.match(markup,/role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(markup,/aria-label="Учебная схема A: толщина 2 мм, рёбер 4/);
  assert.match(markup,/aria-label="Учебная схема B: толщина 3 мм, рёбер 3/);
  assert.match(markup,/Условие выполнено/);
  assert.match(markup,/Прочность<small>≥ 15/);
  assert.match(markup,/Стоимость<small>≤ 16/);
  assert.match(markup,/Масса<small>≤ 16/);
  assert.match(markup,/В файл работы входит текущий вариант B/);
  assert.match(markup,/Это игровая модель/);
  assert.doesNotMatch(markup,/\bdata-action=/);
  assert.doesNotMatch(markup,/ec-delta-(?:good|bad|positive|negative)/);
  const hostile='<img src=x onerror=alert(1)>';
  assert.doesNotMatch(compare.html({draft:{thickness:hostile,ribs:4},view:{reference:{thickness:2,ribs:hostile}}}),/<img|onerror/);
});
