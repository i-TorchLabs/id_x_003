"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, InputGroup, Label, TextField, toast } from "@heroui/react";
import { loginApi } from "@/api/user";
import { useUserStore, type UserState } from "@/context/UserContext";
import { redirectToAdfsAuthorize } from "@/utils/sso";

export default function LoginView() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // 验证码（漏洞报告 #3）：连续失败后后端下发，需输入后才能继续登录
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captchaId, setCaptchaId] = useState("");
  const [captchaImg, setCaptchaImg] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const router = useRouter();
  const userStore = useUserStore();

  const onLogin = () => {
    setLoading(true);
    loginApi({
      username,
      password,
      captcha_id: captchaId,
      captcha_code: captchaCode,
    })
      .then((data) => {
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
        // 后端要求验证码：展示验证码图片与输入框
        const d = (error as any)?.data;
        if (d?.need_captcha === "true" && d?.image_base64) {
          setNeedCaptcha(true);
          setCaptchaId(d.captcha_id || "");
          setCaptchaImg(d.image_base64);
          setCaptchaCode("");
        }
        toast.danger(error.message);
      });
  };

  const onJump = () => {
    redirectToAdfsAuthorize();
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!loading) onLogin();
                }}
              >
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
              {needCaptcha && (
                <div className="mt-4 w-full">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <TextField value={captchaCode} onChange={setCaptchaCode}>
                        <InputGroup>
                          <InputGroup.Prefix className="w-20">Captcha</InputGroup.Prefix>
                          <InputGroup.Input placeholder="Code" maxLength={4} />
                        </InputGroup>
                      </TextField>
                    </div>
                    {/* 点击图片刷新验证码（触发一次空登录换取新验证码） */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={captchaImg}
                      alt="captcha"
                      title="Click to refresh"
                      onClick={() => {
                        setCaptchaCode("");
                        onLogin();
                      }}
                      className="h-[40px] w-[110px] cursor-pointer rounded border border-gray-300 bg-white"
                    />
                  </div>
                </div>
              )}
              <div className="mt-6">
                <Button
                  variant="primary"
                  fullWidth
                  type="submit"
                  isPending={loading}
                >
                  Login
                </Button>
              </div>
              </form>
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
