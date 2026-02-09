import { useMemo } from "react";
import { ConnectButton } from "thirdweb/react";
import { createWallet } from "thirdweb/wallets";
import { THIRDWEB_CLIENT, TARGET_CHAIN } from "../lib/thirdweb";

type Status = {
  type: "pending" | "success" | "error" | "idle";
  message: string;
};

type WalletMenuProps = {
  onStatus?: (status: Status) => void;
};

export default function WalletMenu({ onStatus }: WalletMenuProps) {
  const wallets = useMemo(
    () => [
      createWallet("io.metamask"),
      createWallet("app.phantom"),
      createWallet("com.coinbase.wallet"),
      createWallet("me.rainbow"),
      createWallet("io.rabby"),
      createWallet("io.zerion.wallet"),
    ],
    []
  );

  return (
    <div className="relative z-50">
      <ConnectButton
        client={THIRDWEB_CLIENT}
        chain={TARGET_CHAIN}
        wallets={wallets}
        theme="dark"
      />
    </div>
  );
}
