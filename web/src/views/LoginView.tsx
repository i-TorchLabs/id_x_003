"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, InputGroup, Label, TextField, toast } from "@heroui/react";
import { post, type Response } from "@/api/http";
import { login } from "@/api/url";
import { useUserStore, type UserState } from "@/context/UserContext";
import { SITE_URL } from "@/utils/config";

export default function LoginView() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const userStore = useUserStore();

  const onLogin = () => {
    setLoading(true);
    post({
      url: login,
      data: {
        username,
        password,
      },
    })
      .then(({ data }: Response) => {
        userStore
          .saveUser({
            ...data,
            username,
          } as UserState)
          .then(() => {
            if (data.role === "admin") {
              router.push("/f/aa/admin/project-management");
            } else {
              router.push("/f/aa/user/home");
            }
            setLoading(false);
          });
      })
      .catch((error) => {
        setLoading(false);
        toast.danger(error.message);
      });
  };

  const onJump = () => {
    window.location.href = `${SITE_URL}/s/aa/login`;
  };

  return (
    <div
      className="relative overflow-hidden h-screen w-full bg-cover"
      style={{ backgroundImage: "url(/images/LOGIN-BG.jpg)", backgroundSize: "100%" }}
    >
      <div className="w-full h-full flex items-center justify-center backdrop-blur-[4px]">
        <div className="flex rounded-[10px] bg-white border-2 border-[#f0f0f0] shadow-[0px_0px_7px_#dddddd]">
          <div className="block relative min-w-[450px] w-[450px] h-[500px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/LOGIN-LEFT.jpeg" alt="" className="w-full h-full object-cover" />
          </div>
          <div className="w-[500px] h-[500px] flex justify-center flex-col items-center bg-[#bbdefb]">
            <div className="mb-8 font-bold text-[32px]">Activity Management System</div>
            <div className="mb-8 font-normal text-[25px]">AA Login In</div>
            <div className="w-3/5">
              <div className="w-full">
                <TextField value={username} onChange={setUsername}>
                  <InputGroup>
                    <InputGroup.Prefix className="w-20">User</InputGroup.Prefix>
                    <InputGroup.Input placeholder="Please input username" />
                  </InputGroup>
                </TextField>
              </div>
              <div className="mt-4 w-full">
                <TextField value={password} onChange={setPassword} type="password">
                  <InputGroup>
                    <InputGroup.Prefix className="w-20">Password</InputGroup.Prefix>
                    <InputGroup.Input placeholder="Please input password" />
                  </InputGroup>
                </TextField>
              </div>
              <div className="mt-6">
                <Button
                  variant="primary"
                  fullWidth
                  isPending={loading}
                  onPress={onLogin}
                >
                  Login
                </Button>
              </div>
              <div className="mt-6">
                <Button
                  fullWidth
                  isPending={loading}
                  onPress={onJump}
                  className="text-white bg-[#ee9a00] border-[#ee9a00]"
                >
                  Go Student Client
                </Button>
              </div>
            </div>
            <br />
            <div className="text-[darkred]">
              Please connect a VPN to use if you are outside the school.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
