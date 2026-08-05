const btn = document.querySelector("#btnLogin");

btn.onclick = async ()=>{

    const username=document.querySelector("#username").value.trim();

    const password=document.querySelector("#password").value.trim();

    const res=await fetch("/api/login",{

        method:"POST",

        headers:{
            "Content-Type":"application/json"
        },

        body:JSON.stringify({

            username,
            password

        })

    });

    const data=await res.json();

    if(data.success){

        location.href="/";

    }else{

        document.querySelector("#msg").innerHTML=data.message;

    }

}