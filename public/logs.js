document.getElementById("btnBack").onclick=()=>{

    location.href="index.html";

};

async function loadLogs(){

    const res=await fetch("/api/logs");

    if(res.status!=200){

        alert("Bạn không có quyền.");

        location.href="index.html";

        return;

    }

    const data=await res.json();

    const tbody=document.getElementById("tableBody");

    tbody.innerHTML="";

    let stt=1;

    data.forEach(r=>{

        tbody.innerHTML+=`

<tr>

<td>${stt++}</td>

<td>${new Date(r.created_at).toLocaleString("vi-VN")}</td>

<td>${r.username}</td>

<td>${r.action}</td>

<td>${r.target_name??""}</td>

</tr>

`;

    });

}

loadLogs();