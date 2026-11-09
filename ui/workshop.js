/* Campus Islands · hero / soft / still 4s.
   Ground: layered coast, lawn, paved square, channel, timber bridge and quay.
   Structure: timber workshop, porch, greenhouse, pergola and real-goal observatories.
   Movers: articulated agents, working flywheels, courier cart, wind and water.
   Furniture: workstations, blueprints, books, bench, planters, fence and mail kiosk.
   Light: task screens, lanterns, permission beacons and goal-state signal lamps. */
function agentVisualState(a) { return agentControl(a).effective; }

function goalBudgetRemaining(a) {
  if(!Number.isFinite(a.tokenBudget)||a.tokenBudget<=0||!Number.isFinite(a.tokensUsed))return null;
  return Math.max(0,Math.min(1,1-a.tokensUsed/a.tokenBudget));
}
function workshopFigure(project,index,agents,onPick,docker=false) {
  const variant=[...project.name].reduce((n,c)=>(n+c.charCodeAt(0))%3,0);
  return Diorama.figure({
    name:'campus-'+index,size:'hero',theme:{base:'soft',accent:'#66816b',bg:'transparent',halo:.2},
    title:docker?I18n.t('Puerto Docker'):project.name,
    means:I18n.t('Un campus de trabajo donde agentes, goals y estados se hacen visibles en pequeños talleres.'),
    hint:I18n.t('Hover the workshop roof; click the observatory or a robot to open its conversation.'),
    camera:{az:38,el:35.264,pad:1.06},still:4,tilt:1.6,
    build(o) {
      const D=o.D,p=o.pal,hot=[],robots=[],goals=[],records=agents;
      const baseY=.25;
      D.slab(25,17.5,p.water,0,0,0,null,{h:.8,r:3,side:p.base});
      if(!docker){D.slab(23.2,15.6,p.sand,-.3,.11,-.1,null,{h:.28,r:2.7});D.slab(22,14.2,p.grass,-.4,.21,-.25,null,{h:.12,r:2.35})}
      const waves=[];
      [[-8,7.3],[-4,7.8],[.3,7.8],[5,7.6],[10.7,4.5],[11.5,.3],[-11,-4.5]].forEach((q,i)=>{
        const w=D.box(1.2+i%2*.5,.015,.06,p.line,q[0],.025,q[1],null,{shadow:false});waves.push({mesh:w,x:q[0]});
      });
      if(docker)return buildPort(D,p,agents,hot,waves,onPick);
      D.slab(17,5.7,p.ground,-.3,.27,2.1,null,{h:.06,r:.8});
      D.box(2.2,.025,10.5,p.ground,1,.3,-1.2,null,{shadow:false});
      for(let i=0;i<10;i++)D.box(.95,.02,.5,p.paper,-8+i*1.85,.32,1.3,null,{shadow:false});
      // Irrigation channel and a timber footbridge.
      D.slab(1.2,9.5,p.water,-8.5,.29,-1.2,null,{h:.04,r:.3});
      for(let i=0;i<7;i++)D.box(1.9,.1,.28,p.wood,-8.5,.41,.65+i*.29);
      [-9.3,-7.7].forEach(x=>{D.box(.1,.75,.1,p.wood,x,.7,1);D.box(.1,.75,.1,p.wood,x,.7,2.3);D.box(.09,.1,1.5,p.wood,x,1.05,1.65)});
      // Workshop shell, inset windows, door, porch and an opening gabled roof.
      const house=D.group(-4.5,baseY,-2.7);house.name='workshop';
      const wall=D.box(6.1,3.05,.15,p.paper,0,1.53,-2.08,house);
      [-3,3].forEach(x=>D.box(.15,3.05,4.3,p.paper,x,1.53,0,house));
      D.box(6.1,.2,.14,p.wood,0,2.96,2.08,house);
      D.box(4.5,1.15,.15,p.paper,.7,.6,2.08,house);
      D.box(6,.12,4.2,p.wood,0,.18,0,house);
      D.box(4,.12,.7,p.wood,.2,1.2,-1.35,house);
      [-.8,1.2].forEach(x=>{D.box(.9,.7,.08,p.ink,x,1.72,-1.4,house);D.box(.7,.5,.03,p.sky,x,1.72,-1.34,house,{shadow:false})});
      D.box(6.25,.16,4.5,p.wood,0,.18,0,house);
      D.box(.95,2.05,.08,p.wood,-2,1.15,2.2,house,{on:wall});
      D.box(.73,1.86,.09,p.ink,-2,1.12,2.25,house,{shadow:false});
      D.box(1.2,.18,.85,p.cloud,-2,.18,2.6,house);
      [.05,1.9].forEach(x=>{
        D.box(1.45,1.32,.09,p.wood,x,1.86,2.2,house,{on:wall});
        D.box(1.25,1.1,.04,p.sky,x,1.86,2.26,house,{shadow:false});
        D.box(.07,1.2,.035,p.paper,x,1.86,2.3,house,{shadow:false});
        D.box(1.3,.06,.035,p.paper,x,1.87,2.3,house,{shadow:false});
        D.box(1.55,.13,.45,p.wood,x,1.13,2.37,house);
        D.box(1.1,.25,.32,p.terracotta,x,1.32,2.38,house);
        D.props.bush(x,2.38,house,{r:.27}).position.y=1.45;
      });
      const roof=D.group(0,3.05,0,house);
      D.wedge(6.65,1.7,4.8,variant===1?p.sage:p.terracotta,0,0,0,roof);
      D.box(6.7,.14,.16,p.wood,0,1.68,0,roof);
      for(let i=0;i<7;i++)D.box(.055,.06,4.65,p.sand,-2.7+i*.9,.07,0,roof,{shadow:false});
      D.box(.6,1.35,.6,p.cloud,-1.9,1.25,-1.1,roof);
      D.box(.8,.16,.8,p.wood,-1.9,1.97,-1.1,roof);
      const steam=[0,1,2].map(()=>D.ball(.19,p.cloud,-6.4,5.8,-3.8));
      const porch=D.group(-1.5,baseY,-.1);
      [0,2].forEach(x=>D.box(.13,2.6,.13,p.wood,x,1.3,0,porch));
      D.box(2.4,.14,1.3,p.wood,1,2.65,-.3,porch);
      D.props.lamp(-1.5,-.1,null,{h:2.6});
      // Planning table, rolled blueprints and pinned plans.
      const plan=D.group(-5.6,baseY,2);plan.name='planning table';
      D.box(2.9,.12,1.45,p.wood,0,1.2,0,plan);
      [-1.1,1.1].forEach(x=>[-.45,.45].forEach(z=>D.box(.12,1.2,.12,p.wood,x,.6,z,plan)));
      D.box(2.3,.025,1,p.sky,0,1.28,0,plan,{shadow:false});
      D.box(1.45,.02,.04,p.paper,-.2,1.3,0,plan,{shadow:false});
      const scroll=D.cyl(.12,.12,1.1,p.paper,1,1.41,0,plan,8);scroll.rotation.z=Math.PI/2;
      const pinboard=D.group(-5.5,baseY,-.1);
      D.box(2.6,1.5,.13,p.wood,0,2.2,0,pinboard);
      [-.95,.95].forEach(x=>D.box(.1,2.6,.1,p.wood,x,1.3,0,pinboard));
      [-.72,0,.72].forEach((x,i)=>D.box(.53,.72,.03,i===1?p.sky:p.paper,x,2.2,.09,pinboard,{shadow:false}));
      // Greenhouse or garden pavilion varies the silhouette across projects.
      const garden=D.group(-.1,baseY,-4.7);
      D.box(3.2,.25,2.4,p.wood,0,.12,0,garden);
      if(variant===2){
        [-1.4,1.4].forEach(x=>[-1,1].forEach(z=>D.box(.12,2,.12,p.wood,x,1,z,garden)));
        D.wedge(3.5,.8,2.6,p.sage,0,2,0,garden);
      }else{
        D.box(2.9,1.65,2.1,p.sky,0,1,0,garden);
        [-1.5,0,1.5].forEach(x=>D.box(.07,1.9,2.2,p.paper,x,1.05,0,garden));
        D.wedge(3.25,.85,2.45,p.cloud,0,1.9,0,garden);
      }
      [-.8,.8].forEach(x=>{D.cyl(.3,.22,.45,p.terracotta,x,.48,.2,garden,8);D.ball(.4,p.leaf,x,.95,.2,garden)});
      const goalAgents=agents.filter(a=>a.mode==='goal'||a.goalStatus||a.goalObjective);
      D.slab(8.8,6.6,p.cloud,5.2,.29,-1.6,null,{h:.18,r:.9});
      if(goalAgents.length){
        goalAgents.slice(0,3).forEach((agent,i)=>{
          const x=goalAgents.length===1?5.2:2.7+i*2.7;goals.push(buildGoal(D,p,agent,x,-2,hot));
        });
      }else{
        const observatory=D.group(5.1,.4,-2.3);observatory.name='observatory';
        D.cyl(1.5,1.65,.4,p.wood,0,.2,0,observatory,12);
        D.cyl(1.2,1.2,1.5,p.paper,0,1.1,0,observatory,12);D.dome(1.35,p.sage,0,1.9,0,observatory);
        const telescope=D.group(.1,2.3,.1,observatory);telescope.rotation.z=-.4;
        D.cyl(.2,.26,1.65,p.wood,0,.7,0,telescope,10);D.cyl(.3,.3,.18,p.ink,0,1.6,0,telescope,10);
      }
      // Workstations belong to real agents, never placeholder people.
      agents.slice(0,4).forEach((a,i)=>{
        const x=-1.2+i*2.2;
        D.box(1.7,.1,.9,p.wood,x,1.32,1.6);[-.65,.65].forEach(dx=>D.box(.1,1,.1,p.wood,x+dx,.8,1.6));
        D.box(.08,.3,.08,p.steel,x,1.5,1.45);D.box(.9,.64,.08,p.ink,x,1.95,1.45);
        D.box(.75,.48,.025,p.sky,x,1.95,1.5,null,{shadow:false});D.box(.65,.04,.25,p.cloud,x,1.41,1.9);
      });
      // Bench, mail kiosk, books, paths and coastal garden furniture.
      D.box(3.4,.13,.7,p.wood,-5.8,.8,5.1);D.box(3.4,.7,.12,p.wood,-5.8,1.18,5.4);
      [-7,-4.6].forEach(x=>D.box(.12,.6,.5,p.wood,x,.5,5.1));
      const mailbox=D.group(-8.6,.3,4.5);D.box(.16,1.15,.16,p.wood,0,.58,0,mailbox);D.rbox(.7,.6,.75,p.accent,0,1.42,0,mailbox);D.box(.5,.06,.035,p.ink,0,1.48,.39,mailbox);
      const flag=D.props.flag(9,.2,null,{h:3,color:p.accent});
      [[-10,-4.7,1],[-9.5,-2,.7],[9,-5.2,.9],[9.5,-3.3,.65],[7.8,5.3,.65]].forEach((q,i)=>D.props.tree(q[0],q[1],null,{r:q[2],kind:i%2?'pine':'round'}));
      [[-9.5,5.7],[-3,-5.8],[8.7,3.8]].forEach(q=>D.props.bush(q[0],q[1],null,{r:.4}));
      [[-10,3.4],[10.5,-.4],[-8.8,-5.6]].forEach((q,i)=>D.props.rock(q[0],q[1],null,{r:.35+i*.05}));
      [-1.8,-.8,.2].forEach((x,i)=>{D.box(.6,.15+i*.09,.6,[p.terracotta,p.sky,p.sage][i],x,.45,-.3);D.box(.45,.04,.48,p.paper,x,.56+i*.09,-.3)});
      [0,1,2,3].forEach(i=>{D.box(.1,.7,.1,p.wood,1+i*.7,.6,5.3);if(i<3)D.box(.7,.1,.08,p.wood,1.35+i*.7,.83,5.3)});
      agents.slice(0,12).forEach((a,i)=>robots.push(buildRobot(D,p,a,i,hot)));
      const cart=D.group(-7,.35,6.1),wheels=[];
      D.box(1.4,.22,.8,p.wood,0,.45,0,cart);D.box(.9,.6,.6,p.cloud,0,.82,0,cart);
      [-.5,.5].forEach(x=>[-.45,.45].forEach(z=>wheels.push(D.wheel(.22,.14,p.tyre,x,.22,z,cart))));
      const cartPath=D.path([[-7,6.1],[3,6.1]],false,0);hot.push(house,plan);
      return {hot,robots,goals,records,waves,steam,flag,roof,house,cart,wheels,cartPath,roofSpring:D.spring(100,20),lastPress:-1,docker:false};
    },
    tick(ctx) {
      const D=ctx.D,p=ctx.parts,t=ctx.t;
      p.waves.forEach((w,i)=>{w.mesh.scale.x=.8+.2*D.wave(t,5.7,i*.17);w.mesh.position.x=w.x+.12*D.wave(t,7,i*.2)});
      if(p.docker){tickPort(ctx,onPick);return}
      const working=p.records.some(a=>agentVisualState(a)==='working'||agentVisualState(a)==='planning');
      p.steam.forEach((s,i)=>{const u=D.phase(t,4.5,i*.33);s.visible=working;s.position.y=5.6+u*1.2+p.roofSpring.x;s.position.x=-6.4+.25*u;s.scale.setScalar((1-u)*1.2)});
      p.flag.cloth.rotation.y=.16*D.wave(t,3.8);
      p.roofSpring.t=ctx.active===p.house?1.5:ctx.hover===p.house?.6:0;p.roofSpring.step(ctx.dt);p.roof.position.y=3.05+p.roofSpring.x;
      p.robots.forEach((r,i)=>tickRobot(ctx,r,i));p.goals.forEach(g=>tickGoal(ctx,g));
      const phase=D.phase(t,22),distance=working?(phase<.5?D.inOut(phase*2):1-D.inOut((phase-.5)*2))*p.cartPath.length:0;
      D.place(p.cart,p.cartPath,distance);p.cart.position.y=.35;if(phase>=.5&&working)p.cart.rotation.y+=Math.PI;D.spin(p.wheels,distance,.22);
      if(ctx.pressed&&p.lastPress!==ctx.pressedAt){p.lastPress=ctx.pressedAt;if(ctx.pressed.userData.agentId)onPick(ctx.pressed.userData.agentId)}
      ctx.read=working?I18n.t('Campus · agentes trabajando'):I18n.t('Campus · ')+p.records.length+I18n.t(' agentes');
    }
  });
}
function buildRobot(D,p,agent,index,hot) {
  const x=-6.9+(index%7)*2.15,z=3.65+Math.floor(index/7)*1.6;
  const g=D.group(x,.3,z),color=agent.harness==='claude'?p.terracotta:agent.harness==='codex'?p.accent:p.slate;
  const legs=[D.group(-.2,.3,0,g),D.group(.2,.3,0,g)];
  legs.forEach(l=>{D.box(.19,.35,.2,p.steel,0,-.08,0,l);D.box(.25,.12,.36,p.ink,0,-.27,.06,l)});
  const body=D.group(0,.75,0,g);const jacket=D.rbox(.65,.65,.48,color,0,0,0,body);
  D.box(.42,.3,.18,p.cloud,0,.02,-.33,body);D.box(.22,.08,.035,p.paper,0,.1,.25,body);
  const head=D.group(0,1.4,0,g);D.rbox(.82,.6,.58,p.paper,0,0,0,head);
  const visor=D.box(.65,.27,.035,p.ink,0,.01,.31,head);
  const eyes=[D.ball(.055,p.sky,-.18,.03,.35,head),D.ball(.055,p.sky,.18,.03,.35,head)];
  D.cyl(.035,.035,.23,p.steel,.2,.42,0,head,6);
  const beacon=D.ball(.09,color,.2,.6,0,head),arms=[D.group(-.54,.95,0,g),D.group(.54,.95,0,g)];
  [-.4,.4].forEach(x=>D.ball(.12,color,x,.95,0,g));
  arms.forEach(a=>{D.box(.16,.44,.16,color,0,-.2,0,a);D.ball(.11,p.cloud,0,-.44,0,a)});
  if(agent.mode==='plan'){D.box(.7,.04,.52,p.sky,0,.93,.44,g);D.box(.5,.025,.03,p.paper,0,.96,.44,g);D.box(.65,.1,.6,p.sky,0,.36,0,head)}
  if(agent.mode==='goal'||agent.goalStatus){D.torus(.22,.045,p.mustard,-.22,.42,.03,head);D.ball(.06,p.terracotta,-.22,.42,.03,head)}
  const attention=D.group(0,2.15,0,g);D.ball(.15,p.mustard,0,0,0,attention);D.cyl(.03,.03,.25,p.wood,0,-.25,0,attention,6);
  const ring=D.torus(.65,.055,p.accent,0,.06,0,g);ring.rotation.x=Math.PI/2;ring.visible=false;
  g.name=agent.name;g.userData.agentId=agent.id;hot.push(g);
  return {g,body,jacket,head,visor,eyes,beacon,arms,legs,attention,ring,agent,x,z,spring:D.spring(110,20),materials:{normal:D.mat(color),warning:D.mat(p.mustard),error:D.mat(p.terracotta),done:D.mat(p.accent),plan:D.mat(p.sky),goal:D.mat(p.plum),idle:D.mat(p.slate)}};
}
function tickRobot(ctx,r,index) {
  const D=ctx.D,t=ctx.t,s=agentVisualState(r.agent),work=s==='working',plan=s==='planning',call=s==='waiting'||s==='blocked'||s==='error',rest=s==='paused'||s==='exited';
  const selected=ctx.active===r.g,hover=ctx.hover===r.g;
  r.spring.t=selected?.23:hover?.08:0;r.spring.step(ctx.dt);
  r.g.position.set(r.x,.3+r.spring.x,r.z);r.g.rotation.y=0;r.body.rotation.z=0;
  r.body.position.y=rest?.62:.75;r.head.position.y=rest?1.23:1.4;
  r.body.scale.y=s==='exited'?1:1+.012*D.wave(t,5.3,index*.2);
  r.head.rotation.y=plan?.3*D.wave(t,5,index):work?.13*D.wave(t,3,index):s==='observed'||s==='idle'?.25*D.pulse(t,15,.15):0;
  r.head.rotation.x=rest?.22:s==='ready'||s==='complete'?.1*D.pulse(t,9,.18):0;
  r.arms[0].rotation.x=plan?-1.2+.2*D.wave(t,.7,index):work?-.8+.28*D.wave(t,.6,index):rest?.35:0;
  r.arms[1].rotation.x=call?-2.3+.6*D.wave(t,1.7,index):plan?-.8+.3*D.wave(t,.9,index):work?-.8-.28*D.wave(t,.6,index):s==='complete'?-2.2:0;
  r.arms[1].rotation.z=call?.3+.15*D.wave(t,1.2,index):0;
  r.legs.forEach((l,i)=>{l.rotation.x=work?.13*D.wave(t,.6,index+i*.5):rest?-.45:0});
  if(work)r.body.rotation.z=.045*D.wave(t,.6,index);
  r.attention.visible=call;r.attention.position.y=2.15+.15*D.wave(t,1.7,index);
  r.eyes.forEach(e=>e.scale.y=s==='exited'?.1:rest?.4:1);
  r.jacket.material=s==='blocked'||s==='error'?r.materials.error:s==='waiting'?r.materials.warning:r.agent.mode==='plan'?r.materials.plan:r.agent.mode==='goal'?r.materials.goal:rest||s==='observed'||s==='idle'?r.materials.idle:r.materials.done;
  r.beacon.material=s==='blocked'||s==='error'?r.materials.error:call?r.materials.warning:s==='complete'?r.materials.done:r.materials.normal;
  r.beacon.scale.setScalar(call?1+.35*D.wave(t,1.7,index):1);r.ring.visible=selected;r.ring.scale.setScalar(selected?1.08:1);
}
function buildGoal(D,p,agent,x,z,hot) {
  const g=D.group(x,.43,z);g.name='observatory';g.userData.agentId=agent.id;hot.push(g);
  D.cyl(1.02,1.18,.32,p.wood,0,.16,0,g,12);
  D.cyl(.8,.85,1.15,p.paper,0,.9,0,g,12);D.cyl(.9,.9,.14,p.accent,0,1.5,0,g,12);
  D.cyl(.24,.32,.55,p.wood,0,1.85,0,g,10);
  const rotor=D.group(0,2.9,0,g),outer=D.torus(.9,.1,p.mustard,0,0,0,rotor),inner=D.torus(.63,.07,p.wood,0,0,0,rotor);
  inner.rotation.y=Math.PI/2;outer.rotation.x=.45;const core=D.ball(.31,p.accent,0,0,0,rotor);
  [-1.2,1.2].forEach(x=>D.box(.1,1.25,.12,p.wood,x,2.1,0,g));
  const flag=D.props.flag(.95,.35,g,{h:3.5,color:p.mustard});
  const barrier=D.group(-.85,.5,1.1,g);D.box(1.7,.14,.12,p.terracotta,.85,0,0,barrier);
  const tank=D.group(1.15,0,.45,g);D.cyl(.25,.3,.18,p.wood,0,.12,0,tank,8);D.cyl(.24,.24,1.4,p.cloud,0,.9,0,tank,8);
  const fuel=D.cyl(.25,.25,1.25,p.mustard,0,.85,0,tank,8);
  const trophy=D.group(0,1.7,.1,g);D.cyl(.18,.27,.5,p.mustard,0,.2,0,trophy,10);D.dome(.4,p.mustard,0,.48,0,trophy);
  const pause=D.group(0,2.8,0,g);[-.18,.18].forEach(x=>D.box(.12,.6,.16,p.wood,x,0,0,pause));
  const selection=D.torus(1.3,.06,p.accent,0,.04,0,g);selection.rotation.x=Math.PI/2;selection.visible=false;
  return {g,agent,rotor,outer,inner,core,flag,barrier,fuel,trophy,pause,selection,spring:D.spring(100,20),materials:{active:D.mat(p.accent),blocked:D.mat(p.terracotta),paused:D.mat(p.slate),ready:D.mat(p.mustard)}};
}
function tickGoal(ctx,g) {
  const D=ctx.D,t=ctx.t,a=g.agent,control=agentControl(a),blocked=control.goalNeedsAttention,paused=control.goal==='paused',done=control.goal==='complete';
  const running=control.working&&!blocked&&!paused&&!done;
  g.rotor.rotation.y=running?t*.7:0;g.inner.rotation.x=running?.35+D.wave(t,6)*.2:.35;
  g.core.material=blocked?g.materials.blocked:paused?g.materials.paused:done?g.materials.ready:g.materials.active;
  g.barrier.rotation.z=blocked?0:Math.PI/2;g.pause.visible=paused;g.trophy.visible=done;g.rotor.visible=!done&&!paused;
  const remaining=goalBudgetRemaining(a);g.fuel.visible=remaining!==null;g.fuel.scale.y=remaining===null?1:Math.max(.01,remaining);g.fuel.position.y=.225+(remaining===null?1:remaining)*.625;
  g.flag.cloth.rotation.y=blocked?.2*D.wave(t,1.3):paused?0:.12*D.wave(t,3.1);
  g.spring.t=ctx.active===g.g?.1:ctx.hover===g.g?.05:0;g.spring.step(ctx.dt);g.rotor.scale.setScalar(1+g.spring.x);g.selection.visible=ctx.active===g.g;
}
function buildPort(D,p,containers,hot,waves,onPick) {
  D.slab(19,11,p.sand,-1.5,.32,-1,null,{h:.18,r:1.2});D.box(14,.025,2,p.ground,-2,.43,3,null,{shadow:false});
  for(let i=0;i<13;i++)D.box(.4,.15,5,p.wood,5.7+i*.35,.32,3.7);
  [6.2,8,9.8].forEach(x=>{D.cyl(.1,.12,.9,p.wood,x,.65,1.5,null,8);D.cyl(.12,.12,.13,p.paper,x,1.15,1.5,null,8)});
  const warehouse=D.group(-5,.43,-3);warehouse.name='warehouse';D.box(5.3,2.7,3.6,p.paper,0,1.35,0,warehouse);D.wedge(5.7,1.1,4,p.sage,0,2.7,0,warehouse);
  [-1.5,1.5].forEach(x=>{D.box(1.5,1.8,.08,p.wood,x,1,1.85,warehouse);D.box(1.3,1.6,.025,p.slate,x,1,1.91,warehouse)});
  const crane=D.group(-.7,.43,-2.7);crane.name='crane';
  [-.5,.5].forEach(x=>[-.5,.5].forEach(z=>D.box(.16,5.8,.16,p.mustard,x,2.9,z,crane)));
  [1.4,2.8,4.2,5.6].forEach(y=>D.box(1.15,.12,1.15,p.wood,0,y,0,crane));
  const arm=D.group(0,5.9,0,crane);D.box(7,.3,.45,p.mustard,2,0,0,arm);D.box(1,.9,1,p.paper,.4,-.6,0,arm);D.box(.6,.4,.035,p.sky,.4,-.55,.52,arm);
  D.cyl(.03,.03,2.8,p.steel,5,-1.5,0,arm,6);D.torus(.16,.055,p.steel,5,-3,0,arm);
  containers.slice(0,18).forEach((a,i)=>{
    const g=D.group(2.3+(i%3)*1.8,.43+Math.floor(i/9)*.95,-3.6+Math.floor((i%9)/3)*1.5),c=[p.sky,p.sage,p.terracotta][i%3];
    D.box(1.65,.9,1.25,c,0,.45,0,g);for(let j=0;j<5;j++)D.box(.035,.72,.03,p.cloud,-.6+j*.3,.45,.64,g,{shadow:false});
    D.ball(.06,a.state==='running'?p.accent:p.slate,.65,.77,.65,g);g.name=a.name;g.userData.containerId=a.id;hot.push(g);
  });
  const boat=D.group(5.8,-.1,7.2);boat.name='boat';D.rbox(4.2,.6,1.8,p.paper,0,.4,0,boat);D.box(2,.12,1.5,p.wood,0,.75,0,boat);D.rbox(1.2,1,.95,p.accent,.5,1.3,0,boat);D.box(.75,.4,.035,p.sky,.5,1.4,.5,boat);D.cyl(.09,.09,.8,p.terracotta,-.4,1.8,0,boat,8);D.torus(.24,.07,p.terracotta,-1,1,.85,boat);
  [-8.5,-2.5,4].forEach(x=>D.props.lamp(x,3.8,null,{h:2.6}));[-8,-6.5].forEach(x=>D.props.crate(x,.5,1,null,{w:.8,h:.8,d:.8,color:p.wood}));
  D.props.tree(-9,-5.3,null,{r:1,kind:'pine'});D.props.bush(-9,4.3,null,{r:.5});hot.push(crane,warehouse,boat);
  return {hot,records:containers,waves,robots:[],goals:[],boat,arm,crane,lastPress:-1,docker:true,armSpring:D.spring(65,18)};
}
function tickPort(ctx,onPick) {
  const p=ctx.parts,D=ctx.D,t=ctx.t;p.boat.position.y=-.1+.04*D.wave(t,5.2);p.boat.rotation.z=.025*D.wave(t,6.7);
  p.armSpring.t=ctx.active===p.crane?.45:ctx.hover===p.crane?.15:0;p.armSpring.step(ctx.dt);p.arm.rotation.y=p.armSpring.x;
  if(ctx.pressed&&p.lastPress!==ctx.pressedAt){p.lastPress=ctx.pressedAt;onPick(ctx.pressed.userData.containerId || null)}
  ctx.read=I18n.t('Puerto · ')+p.records.length+' contenedores';
}
