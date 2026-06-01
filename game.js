// Maze Survival Quiz - vanilla JS
(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const healthEl = document.getElementById('health-val');
  const ammoEl = document.getElementById('ammo-val');
  const scoreEl = document.getElementById('score-val');
  const modal = document.getElementById('modal');
  const qText = document.getElementById('q-text');
  const qChoices = document.getElementById('q-choices');
  const qCancel = document.getElementById('q-cancel');
  const overlayWin = document.getElementById('overlay-win');
  const overlayLose = document.getElementById('overlay-lose');
  const playAgainWin = document.getElementById('play-again-win');
  const playAgainLose = document.getElementById('play-again-lose');

  // placeholder questions array for easy swapping
  const QUESTIONS = [
    {q:'2+2 = ?', choices:['3','4','5','22'], a:1},
    {q:'Capital of France?', choices:['Berlin','London','Paris','Rome'], a:2},
    {q:'H2O is?', choices:['Oxygen','Hydrogen','Water','Helium'], a:2},
  ];

  // simple map: # wall, . floor, S start, E exit, C chest
  const MAP_STR = [
    '#####################',
    '#S....#.......C....E#',
    '#.##..#..###..###...#',
    '#....C.....#.......#',
    '###.#####.#.#####.###',
    '#......#...#...C....#',
    '#.####.#.###.###.##.#',
    '#....#.#.....#.....#',
    '#.##.#.#####.#.##..#',
    '#..C.....#....#....#',
    '#####################'
  ];

  let TILE = 32;
  let MAP = [];
  let rows = MAP_STR.length;
  let cols = MAP_STR[0].length;

  function parseMap(){
    MAP = [];
    for(let y=0;y<rows;y++){
      const row = [];
      for(let x=0;x<cols;x++){
        row.push(MAP_STR[y][x]);
      }
      MAP.push(row);
    }
  }

  const state = {
    player:{x:1,y:1,px:1,py:1,health:100,ammo:0,score:0,fireRate:1},
    enemies:[],
    projectiles:[],
    chests:[],
    exit:null,
    paused:false,
    lost:false,
    won:false,
    lastTick:0,
    starvationTimer:0
  };

  function findTiles(){
    state.chests = [];
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const t = MAP[y][x];
      if(t==='S'){state.player.x=x;state.player.y=y}
      if(t==='C') state.chests.push({x,y,used:false});
      if(t==='E') state.exit={x,y};
    }
  }

  function resize(){
    const wrap = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.min(wrap.width - 24, cols * TILE);
    canvas.height = Math.min(window.innerHeight - 120, rows * TILE);
    // scale tile to fit if necessary
    const fitX = Math.floor(canvas.width / cols);
    const fitY = Math.floor(canvas.height / rows);
    TILE = Math.max(16, Math.min(fitX, fitY));
    canvas.width = cols * TILE; canvas.height = rows * TILE;
  }

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // fog - visible radius in tiles
    const visR = 4;
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const dx = x - state.player.x;
        const dy = y - state.player.y;
        const d2 = Math.sqrt(dx*dx+dy*dy);
        const sx = x*TILE, sy = y*TILE;
        if(MAP[y][x]==='#'){
          ctx.fillStyle = '#0b2130';
          ctx.fillRect(sx,sy,TILE,TILE);
        } else {
          if(d2 <= visR){
            ctx.fillStyle = '#091827';
            ctx.fillRect(sx,sy,TILE,TILE);
            // floor details
            if(MAP[y][x]==='C'){
              ctx.fillStyle = '#3de0ff';
              ctx.fillRect(sx+TILE*0.2, sy+TILE*0.2, TILE*0.6, TILE*0.6);
            }
            if(MAP[y][x]==='E'){
              ctx.fillStyle = '#9cff8a';
              ctx.fillRect(sx+TILE*0.15, sy+TILE*0.15, TILE*0.7, TILE*0.7);
            }
          } else {
            // dark fog tile
            ctx.fillStyle = '#020406';
            ctx.fillRect(sx,sy,TILE,TILE);
          }
        }
      }
    }

    // draw chests (if visible)
    state.chests.forEach(c=>{
      const dx = c.x - state.player.x, dy = c.y - state.player.y;
      if(Math.sqrt(dx*dx+dy*dy) <= 4 && !c.used){
        ctx.fillStyle = '#ffd36b';
        ctx.fillRect(c.x*TILE+TILE*0.25, c.y*TILE+TILE*0.25, TILE*0.5, TILE*0.5);
      }
    });

    // enemies
    state.enemies.forEach(e=>{
      const dx = e.x - state.player.x, dy = e.y - state.player.y;
      if(Math.sqrt(dx*dx+dy*dy) <= 4){
        ctx.fillStyle = '#ff5252';
        ctx.fillRect(e.x*TILE+4, e.y*TILE+4, TILE-8, TILE-8);
      }
    });

    // projectiles
    state.projectiles.forEach(p=>{
      ctx.fillStyle = '#ffd';
      ctx.fillRect(p.x*TILE+TILE/2-3, p.y*TILE+TILE/2-3, 6,6);
    });

    // player
    ctx.fillStyle = '#88d7ff';
    ctx.beginPath();
    ctx.arc(state.player.x*TILE+TILE/2, state.player.y*TILE+TILE/2, TILE*0.35,0,Math.PI*2);
    ctx.fill();
  }

  function canWalk(x,y){
    if(x<0||y<0||x>=cols||y>=rows) return false;
    return MAP[y][x] !== '#';
  }

  function spawnEnemy(x,y){
    state.enemies.push({x,y,mode:'idle',lastMove:0});
  }

  function update(dt){
    if(state.paused||state.won||state.lost) return;
    // starvation
    state.starvationTimer += dt;
    if(state.starvationTimer > 2000){
      state.starvationTimer = 0;
      state.player.health -= 1;
    }

    // projectiles move
    for(let i=state.projectiles.length-1;i>=0;i--){
      const p = state.projectiles[i];
      p.x += p.vx*dt/200; p.y += p.vy*dt/200;
      // check collisions with enemies
      for(let j=state.enemies.length-1;j>=0;j--){
        const e = state.enemies[j];
        if(Math.hypot(e.x-p.x,e.y-p.y) < 0.6){
          state.enemies.splice(j,1);
          state.projectiles.splice(i,1);
          state.player.score += 10;
          break;
        }
      }
      // out of bounds
      if(p.x<0||p.y<0||p.x>cols||p.y>rows) state.projectiles.splice(i,1);
    }

    // enemies behavior
    state.enemies.forEach(e=>{
      const d = Math.hypot(state.player.x-e.x, state.player.y-e.y);
      if(d < 4){
        // chase
        const dx = state.player.x - e.x;
        const dy = state.player.y - e.y;
        if(Math.abs(dx) > Math.abs(dy)) e.x += Math.sign(dx)*0.02*dt/16;
        else e.y += Math.sign(dy)*0.02*dt/16;
      } else {
        // small random patrol
        if(Math.random() < 0.002*dt/16){
          const dir = [[1,0],[-1,0],[0,1],[0,-1]][Math.floor(Math.random()*4)];
          const nx = Math.round(e.x)+dir[0], ny = Math.round(e.y)+dir[1];
          if(canWalk(nx,ny)){ e.x = nx; e.y = ny; }
        }
      }
      // collision with player
      if(Math.hypot(e.x-state.player.x,e.y-state.player.y) < 0.8){
        state.player.health -= 10;
        // push enemy away
        e.x += (e.x-state.player.x)>0?0.5:-0.5;
      }
    });

    // clamp health
    if(state.player.health <= 0){
      state.player.health = 0; state.lost=true; showLose();
    }

    // update UI
    healthEl.textContent = Math.max(0, Math.round(state.player.health));
    ammoEl.textContent = Math.max(0, Math.round(state.player.ammo));
    scoreEl.textContent = state.player.score;
  }

  // simple movement input
  const keys = {};
  window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()] = true; if(e.key===' '){ e.preventDefault(); tryShoot(); } });
  window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });

  function tryShoot(){
    if(state.paused) return;
    if(state.player.ammo <= 0) return;
    state.player.ammo -= 1;
    // shoot in facing direction (use last movement or up)
    let vx=0, vy=-1;
    if(keys['a']||keys['arrowleft']){vx=-1;vy=0}
    else if(keys['d']||keys['arrowright']){vx=1;vy=0}
    else if(keys['s']||keys['arrowdown']){vx=0;vy=1}
    else if(keys['w']||keys['arrowup']){vx=0;vy=-1}
    state.projectiles.push({x:state.player.x, y:state.player.y, vx, vy});
  }

  function step(time){
    if(!state.lastTick) state.lastTick = time;
    const dt = time - state.lastTick; state.lastTick = time;
    // movement
    if(!state.paused && !state.won && !state.lost){
      let moved=false;
      const px = state.player.x, py=state.player.y;
      if(keys['a']||keys['arrowleft']){
        if(canWalk(px-1,py)){ state.player.x = px-1; moved=true }
      } else if(keys['d']||keys['arrowright']){
        if(canWalk(px+1,py)){ state.player.x = px+1; moved=true }
      } else if(keys['w']||keys['arrowup']){
        if(canWalk(px,py-1)){ state.player.y = py-1; moved=true }
      } else if(keys['s']||keys['arrowdown']){
        if(canWalk(px,py+1)){ state.player.y = py+1; moved=true }
      }
      if(moved) checkTile();
    }

    update(dt);
    draw();
    requestAnimationFrame(step);
  }

  function checkTile(){
    const {x,y} = state.player;
    // chest
    for(const c of state.chests){
      if(!c.used && c.x===x && c.y===y){ openQuestion(c); return }
    }
    // exit
    if(state.exit && state.exit.x===x && state.exit.y===y){ state.won=true; showWin(); }
  }

  function openQuestion(chest){
    chest.used = true;
    state.paused = true;
    // pick random question
    const q = QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)];
    qText.textContent = q.q;
    qChoices.innerHTML = '';
    q.choices.forEach((c,i)=>{
      const btn = document.createElement('button'); btn.textContent = c;
      btn.addEventListener('click', ()=>{ answerQuestion(i===q.a, chest); });
      qChoices.appendChild(btn);
    });
    modal.classList.remove('hidden');
  }

  function answerQuestion(correct, chest){
    modal.classList.add('hidden');
    if(correct){
      // reward
      state.player.ammo += 5;
      state.player.health = Math.min(100, state.player.health + 10);
      state.player.score += 20;
    } else {
      // penalty: spawn enemy near player
      const sx = Math.max(1, state.player.x + (Math.random()<0.5?1:-1));
      const sy = Math.max(1, state.player.y + (Math.random()<0.5?1:-1));
      spawnEnemy(sx,sy);
    }
    state.paused = false;
  }

  qCancel.addEventListener('click', ()=>{ modal.classList.add('hidden'); state.paused=false; });

  function showWin(){
    overlayWin.classList.remove('hidden');
    document.getElementById('win-score').textContent = `Score: ${state.player.score}`;
  }
  function showLose(){
    overlayLose.classList.remove('hidden');
    document.getElementById('lose-score').textContent = `Score: ${state.player.score}`;
  }

  playAgainWin.addEventListener('click', ()=>location.reload());
  playAgainLose.addEventListener('click', ()=>location.reload());

  // initialize
  function init(){
    parseMap(); findTiles(); resize();
    // spawn a few enemies
    spawnEnemy(10,4); spawnEnemy(15,7);
    window.addEventListener('resize', resize);
    requestAnimationFrame(step);
  }

  init();

})();
