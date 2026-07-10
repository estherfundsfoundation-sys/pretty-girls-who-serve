/* Real PGWS community submissions. Every item is saved as pending for national review. */
(() => {
  const modal=document.querySelector('#communityModal');
  const authPanel=document.querySelector('#communityAuth');
  const formPanel=document.querySelector('#communitySubmission');
  const authMessage=document.querySelector('#authMessage');
  const postStatus=document.querySelector('#postMessageStatus');
  const form=document.querySelector('#communityPostForm');
  const client=window.supabase?.createClient(window.PGWS_SUPABASE_URL,window.PGWS_SUPABASE_PUBLISHABLE_KEY);
  let session=null; let requestedKind='wall';
  const titleFor={reflection:'Share your chapter reflection.',wall:'Add your light.',photo:'Share a sister snapshot.'};
  const typeFor={reflection:'sister_wall',wall:'sister_wall',photo:'photo'};
  function message(el,text){el.textContent=text;}
  async function refreshSession(){if(!client)return;const {data}=await client.auth.getSession();session=data.session;renderPanel();}
  function renderPanel(){if(session){authPanel.hidden=true;formPanel.hidden=false;document.querySelector('#submissionTitle').textContent=titleFor[requestedKind];document.querySelector('#postType').value=typeFor[requestedKind];document.querySelector('#signedInCopy').textContent=`Signed in as ${session.user.email}. Your post will be reviewed before it appears publicly.`;}else{authPanel.hidden=false;formPanel.hidden=true;}}
  window.pgwsOpenCommunityModal=(kind)=>{requestedKind=kind;authMessage.textContent='';postStatus.textContent='';renderPanel();modal.showModal();};
  document.querySelector('#closeCommunityModal').addEventListener('click',()=>modal.close());
  modal.addEventListener('click',(event)=>{if(event.target===modal)modal.close();});
  document.querySelector('#emailLoginForm').addEventListener('submit',async(event)=>{event.preventDefault();if(!client){message(authMessage,'Community connection is still loading. Please refresh and try again.');return;}const email=document.querySelector('#memberEmail').value.trim();message(authMessage,'Sending your secure sign-in link…');const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:`${window.location.origin}/#sisterCircle`}});message(authMessage,error?error.message:'Check your email, sister. Open the link there to return and share.');});
  document.querySelector('#signOutButton').addEventListener('click',async()=>{await client.auth.signOut();session=null;renderPanel();});
  form.addEventListener('submit',async(event)=>{event.preventDefault();if(!session){renderPanel();return;}const submit=document.querySelector('#submitCommunityPost');submit.disabled=true;message(postStatus,'Sending your post for approval…');let imagePath=null;const file=document.querySelector('#postPhoto').files[0];try{if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Please choose a JPG, PNG, or WEBP picture.');if(file.size>8*1024*1024)throw new Error('Please choose a picture smaller than 8 MB.');const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-');imagePath=`${session.user.id}/${Date.now()}-${safeName}`;const {error:uploadError}=await client.storage.from('pgws-uploads').upload(imagePath,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;}
      const record={author_id:session.user.id,display_name:document.querySelector('#displayName').value.trim(),post_type:document.querySelector('#postType').value,title:document.querySelector('#postTitle').value.trim()||null,message:document.querySelector('#postMessage').value.trim(),chapter_name:document.querySelector('#chapterName').value.trim()||null,service_hours:document.querySelector('#serviceHours').value?Number(document.querySelector('#serviceHours').value):null,image_path:imagePath,status:'pending'};
      const {error:postError}=await client.from('pgws_posts').insert(record);if(postError)throw postError;form.reset();message(postStatus,'Sent beautifully. PGWS Nationals will review it before it appears on the Sister Wall.');
    }catch(error){message(postStatus,error.message||'Something did not send. Please try again.');}finally{submit.disabled=false;}
  });
  client?.auth.onAuthStateChange((_event,nextSession)=>{session=nextSession;renderPanel();});
  refreshSession();
})();
