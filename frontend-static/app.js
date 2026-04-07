

const mediaInput = document.getElementById("media");
if(mediaInput){
  mediaInput.addEventListener("change", (e)=>{
    uploadedFiles = [...e.target.files];
  });
}

async function submitPost(){
  const content = document.getElementById("content").value;
  const schedule = document.getElementById("schedule").value;

  const selected = [...document.querySelectorAll("input[type=checkbox]:checked")];

  const formData = new FormData();
  formData.append("content", content);

  uploadedFiles.forEach(f=> formData.append("media", f));

  const platforms = selected.map(el=>({
    name: el.dataset.platform,
    account_id: el.value,
    schedule_time: schedule,
    settings: getSettings(el.dataset.platform)
  }));

  formData.append("platforms", JSON.stringify(platforms));

  await fetch(`${API}/posts/create`, { method:"POST", body: formData });

  showToast("Post Scheduled");
  setTimeout(()=> location.href="scheduled.html", 1000);
}

function getSettings(p){
  if(p==="youtube"){
    return {
      title: document.getElementById("yt_title")?.value,
      privacy: document.getElementById("yt_privacy")?.value
    }
  }
  if(p==="instagram"){
    return { reel: document.getElementById("insta_reel")?.checked }
  }
  return {}
}

async function loadPosts(){
  const res = await fetch(`${API}/posts`);
  const data = await res.json();

  document.getElementById("posts").innerHTML = data.map(p=>`
    <div class="card">
      <p>${p.content}</p>
      <span class="badge ${p.status==='scheduled'?'pending':'success'}">${p.status}</span>

      <div style="margin-top:10px;">
        <button onclick="publish(${p.id})">Publish</button>
        <button class="btn-danger" onclick="cancelPost(${p.id})">Cancel</button>
      </div>
    </div>
  `).join("");
}

async function publish(id){
  await fetch(`${API}/posts/${id}/publish`, {method:"POST"});
  showToast("Published");
  loadPosts();
}

async function cancelPost(id){
  await fetch(`${API}/posts/${id}`, {method:"DELETE"});
  showToast("Cancelled");
  loadPosts();
}

if(location.pathname.includes("index") || location.pathname==="/" ) loadPlatforms();
if(location.pathname.includes("create")) loadAccounts();
if(location.pathname.includes("scheduled")) loadPosts();
