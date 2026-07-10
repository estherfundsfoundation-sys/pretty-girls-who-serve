const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];

const lessons=[
  ['01','Her Identity: your worth is not up for debate.','Week one is a soft but strong reset for the way you see yourself. Your confidence is rooted in what God says—not comparison, attention, or perfection.'],
  ['02','Her Mindset: renew the way you speak to yourself.','Week two helps you notice comparison, build confidence, and grow a thought-life that agrees with truth.'],
  ['03','Her Faith: create a rhythm with God.','Week three makes prayer, Scripture, and faith habits practical for your real and beautiful everyday life.'],
  ['04','Her Character: wisdom protects her peace.','Week four is about boundaries, integrity, relationships, discipline, and choosing wisdom in real life.'],
  ['05','Her Calling: turn gifts into service.','Week five connects leadership, impact, and your God-given gifts to the people and places you are called to serve.'],
  ['06','Her Life: build a life that honors God.','Week six brings it together: stewardship, wellness, relationships, rest, money, and a future built with purpose.']
];

const modalContent={
  becoming:['MY BECOMING','Your pathway is being prepared.','Your personal PGWS pathway will bring together faith, confidence, service, and leadership based on your season.'],
  lounge:['SISTERHOOD LOUNGE','A safe, beautiful place to belong.','The lounge will include monthly sisterhood challenges, guided prayer, encouragement, and your official community connection.'],
  serve:['SERVE STUDIO','Put your purpose into motion.','Find service project ideas, event plans, hours tracking, and practical ways to love your community well.'],
  vault:['THE PRETTY VAULT','Your organized resource library.','Brunch blueprints, devotionals, service guides, chapter templates, graphics, and leadership tools will live here.'],
  locator:['CHAPTER LOCATOR','Your local sisterhood is loading.','The live locator will let you search by campus, city, state, and virtual sister circle.'],
  startChapter:['START A CHAPTER','The next chapter could start with you.','The chapter launch pathway will guide you through gathering your girls, setting your vision, training leaders, and serving locally.'],
  academy:['PROVERBS 31 ACADEMY','A preview of your becoming.','Full Academy modules, quizzes, notes, badges, and certificates will unlock inside the PGWS member experience.'],
  identity:['IDENTITY RESET','Your worth is not up for debate.','The Identity Reset will hold affirmations rooted in Scripture, confidence exercises, guided reflection, and resources for replacing harmful self-talk with truth.'],
  prayer:['PRAYER & BIBLE','Meet God in your real life.','The ministry room will include prayer prompts, beginner Bible plans, devotional guides, worship-night tools, and gentle faith resets.'],
  wellness:['SOFT LIFE, STRONG FAITH','Care for the woman you are becoming.','This room will bring together wellness, beauty, healthy routines, boundaries, rest, and spiritual grounding without pressure or comparison.'],
  support:['SISTER SUPPORT','You do not have to carry it alone.','Find support tools for friendship, difficult conversations, healthy relationships, encouragement, and knowing when to reach for trusted help.'],
  membership:['JOIN PGWS','The sisterhood is getting ready for you.','The $20 membership checkout and complete member benefits will be connected here before launch.']
};

const dialog=$('#portalModal');
function openModal(key){
  const [eyebrow,title,text]=modalContent[key]||modalContent.membership;
  $('#modalEyebrow').textContent=eyebrow;$('#modalTitle').textContent=title;$('#modalText').textContent=text;dialog.showModal();
}

$$('[data-modal]').forEach(button=>button.addEventListener('click',()=>openModal(button.dataset.modal)));
$('.close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});

$$('.module').forEach(button=>button.addEventListener('click',()=>{
  const lesson=lessons[Number(button.dataset.module)];
  $$('.module').forEach(item=>item.classList.remove('active'));button.classList.add('active');
  $('#lessonNumber').textContent=lesson[0];$('#lessonTitle').textContent=lesson[1];$('#lessonText').textContent=lesson[2];
  $('#lessonProgress').textContent=`Week ${Number(button.dataset.module)+1} of 6`;
  $('.progress i').style.width=`${(Number(button.dataset.module)+1)*16.66}%`;
}));

$('#menuButton').addEventListener('click',()=>{
  const nav=$('#nav'),open=nav.classList.toggle('open');
  $('#menuButton').setAttribute('aria-expanded',open);
});
$$('#nav a').forEach(link=>link.addEventListener('click',()=>{$('#nav').classList.remove('open');$('#menuButton').setAttribute('aria-expanded','false')}));

const actions={
  sister:['♡','Send a real check-in.','Text one woman: “You crossed my mind today. How are you really doing?” Then make room to listen.','5 MINUTES · SISTERHOOD'],
  serve:['✿','Choose one local need.','Pick a pantry, shelter, school, or elder-care center. Write down one way your chapter can help this month.','15 MINUTES · SERVICE'],
  lead:['✦','Host a soft-power gathering.','Invite three girls to a coffee, prayer, or planning hour. Ask what they need and make one next-step plan together.','20 MINUTES · LEADERSHIP'],
  grow:['✝','Read, reflect, respond.','Read Proverbs 31:25. Write one sentence about where you want strength and dignity to shape your next choice.','10 MINUTES · FAITH']
};
$$('[data-action]').forEach(button=>button.addEventListener('click',()=>{
  const [icon,title,text,time]=actions[button.dataset.action];
  $('.action-icon').textContent=icon;$('#actionTitle').textContent=title;$('#actionText').textContent=text;$('#actionTime').textContent=time;
}));

$$('.resource-filter').forEach(button=>button.addEventListener('click',()=>{
  $$('.resource-filter').forEach(item=>item.classList.remove('active'));button.classList.add('active');
  $$('#chapterResourceGrid .chapter-resource').forEach(card=>card.classList.toggle('hidden',button.dataset.resource!=='all'&&card.dataset.category!==button.dataset.resource));
}));

const quiz=[
  ['When a friend is having a hard week, your first instinct is to…',['Sit with her and make her feel seen.','Help her make a plan and take a next step.','Pray with her and remind her what is true.'],[0,1,2]],
  ['Your dream PGWS event would feel most like…',['A warm sisterhood circle where everyone belongs.','A beautiful service project with clear impact.','A faith-filled reset that leaves girls encouraged.'],[0,1,2]],
  ['The gift you want to grow most is…',['Connection and care.','Courage and leadership.','Wisdom and spiritual depth.'],[0,1,2]]
];
const results=[['The Sister Builder','You make people feel like they belong. Your leadership gift is creating safe, warm spaces where women can be honest, encouraged, and seen.'],['The Impact Muse','You turn good intentions into movement. Your leadership gift is vision, action, and helping people see what is possible when they serve together.'],['The Wisdom Girl','You carry a steady, faith-rooted presence. Your leadership gift is helping people pause, hear truth, and move with purpose.']];
let questionIndex=0,quizScores=[0,0,0];
function renderQuiz(){
  const [question,options,values]=quiz[questionIndex];$('#quizQuestion').textContent=question;$('#quizOptions').innerHTML=options.map((option,index)=>`<button data-answer="${values[index]}">${option}</button>`).join('');
  $('#quizCount').textContent=`Question ${questionIndex+1} of ${quiz.length}`;$('#quizFill').style.width=`${((questionIndex+1)/quiz.length)*100}%`;
  $$('#quizOptions button').forEach(button=>button.addEventListener('click',()=>{quizScores[+button.dataset.answer]++;questionIndex++;if(questionIndex<quiz.length)renderQuiz();else showResult()}));
}
function showResult(){
  const score=Math.max(...quizScores),result=results[quizScores.indexOf(score)];$('#quizQuestion').hidden=true;$('#quizOptions').hidden=true;$('#quizResult').hidden=false;$('#resultTitle').textContent=result[0];$('#resultText').textContent=result[1];$('#quizCount').textContent='Your result is in ✦';$('#quizFill').style.width='100%';
}
$('#restartQuiz').addEventListener('click',()=>{questionIndex=0;quizScores=[0,0,0];$('#quizQuestion').hidden=false;$('#quizOptions').hidden=false;$('#quizResult').hidden=true;renderQuiz()});
renderQuiz();
