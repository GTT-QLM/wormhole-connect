import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Context } from '@wormhole-foundation/wormhole-connect-sdk';

import { CHAINS, TOKENS } from '../../config';
import {
  estimateClaimGasFee,
  estimateSendGasFee,
  parseMessageFromTx,
  PaymentOption,
  sendTransfer,
} from '../../sdk';
import { RootState } from '../../store';
import { setRoute } from '../../store/router';
import { setTxDetails, setSendTx } from '../../store/redeem';
import { displayWalletAddress } from '../../utils';
import {
  registerWalletSigner,
  switchNetwork,
  TransferWallet,
} from '../../utils/wallet';
import { validate, isTransferValid } from '../../utils/transferValidation';
import {
  setManualGasEst,
  setAutomaticGasEst,
  setClaimGasEst,
  setIsTransactionInProgress,
} from '../../store/transfer';

import Button from '../../components/Button';
import CircularProgress from '@mui/material/CircularProgress';
import AlertBanner from '../../components/AlertBanner';
import { Link, Typography } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import PoweredByIcon from '../../icons/PoweredBy';

const useStyles = makeStyles()((theme) => ({
  body: {
    width: '100%',
  },
  poweredBy: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginTop: '24px',
  },
  tosDisclaimer: {
    marginBottom: 5,
    marginLeft: 16,
  },
}));

function Send(props: { valid: boolean }) {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const wallets = useSelector((state: RootState) => state.wallet);
  const { sending, receiving } = wallets;
  const transfer = useSelector((state: RootState) => state.transfer);
  const {
    validations,
    fromNetwork,
    toNetwork,
    token,
    amount,
    destGasPayment,
    toNativeToken,
    relayerFee,
    automaticRelayAvail,
    isTransactionInProgress,
  } = transfer;
  const [isConnected, setIsConnected] = useState(
    sending.currentAddress.toLowerCase() === sending.address.toLowerCase(),
  );
  const [sendError, setSendError] = useState('');

  async function send() {
    setSendError('');
    await validate(dispatch);
    const valid = isTransferValid(validations);
    if (!valid) return;
    dispatch(setIsTransactionInProgress(true));
    try {
      const fromConfig = CHAINS[fromNetwork!];
      if (fromConfig?.context === Context.ETH) {
        registerWalletSigner(fromNetwork!, TransferWallet.SENDING);
        const { chainId } = CHAINS[fromNetwork!]!;
        await switchNetwork(chainId, TransferWallet.SENDING);
      }

      const tokenConfig = TOKENS[token]!;
      const sendToken = tokenConfig.tokenId;

      const receipt: any = await sendTransfer(
        sendToken || 'native',
        `${amount}`,
        fromNetwork!,
        sending.address,
        toNetwork!,
        receiving.address,
        destGasPayment,
        `${toNativeToken}`,
      );
      const txId = receipt.transactionHash;

      let message;
      const toRedeem = setInterval(async () => {
        if (message) {
          clearInterval(toRedeem);
          dispatch(setIsTransactionInProgress(false));
          dispatch(setSendTx(txId));
          dispatch(setTxDetails(message));
          dispatch(setRoute('redeem'));
          setSendError('');
        } else {
          message = await parseMessageFromTx(txId, fromNetwork!);
        }
      }, 1000);
    } catch (e) {
      dispatch(setIsTransactionInProgress(false));
      setSendError('Error sending transfer, please try again');
      console.error(e);
    }
  }

  const setSendingGas = async (gasPayment: PaymentOption) => {
    const tokenConfig = TOKENS[token]!;
    if (!tokenConfig) return;
    const sendToken = tokenConfig.tokenId;

    const gasFee = await estimateSendGasFee(
      sendToken || 'native',
      `${amount}`,
      fromNetwork!,
      sending.address,
      toNetwork!,
      receiving.address,
      gasPayment,
      `${toNativeToken}`,
    );
    if (gasPayment === PaymentOption.MANUAL) {
      dispatch(setManualGasEst(gasFee));
    } else {
      dispatch(setAutomaticGasEst(gasFee));
    }
  };

  // TODO: mock vaa?
  const setDestGas = async () => {
    if (!toNetwork) return;
    const gasFee = await estimateClaimGasFee(toNetwork!);
    dispatch(setClaimGasEst(gasFee));
  };

  useEffect(() => {
    const valid = isTransferValid(validations);
    if (!valid) return;

    if (automaticRelayAvail) {
      setSendingGas(PaymentOption.AUTOMATIC);
    }
    setSendingGas(PaymentOption.MANUAL);
    setDestGas();
  }, [
    validations,
    sending,
    receiving,
    fromNetwork,
    toNetwork,
    token,
    destGasPayment,
    toNativeToken,
    relayerFee,
  ]);

  useEffect(() => {
    setIsConnected(
      sending.currentAddress.toLowerCase() === sending.address.toLowerCase(),
    );
  }, [sending]);

  return (
    <div className={classes.body}>
      {!!props.valid && (
        <AlertBanner
          show={!!props.valid && destGasPayment === PaymentOption.MANUAL}
          content="This transfer will require two transactions - one on the source chain and one on the destination chain."
          warning
          margin="0 0 16px 0"
        />
      )}

      <AlertBanner
        show={!!sendError}
        content={sendError}
        error
        margin="0 0 16px 0"
      />
      {props.valid && !isConnected ? (
        <Button disabled elevated>
          Connect to {displayWalletAddress(sending.type, sending.address)}
        </Button>
      ) : (
        <>
          <div className={classes.tosDisclaimer}>
            <Typography variant="caption">
              By proceeding, you agree to the{' '}
              <Link onClick={() => dispatch(setRoute('terms'))} href="#">
                Terms of Service
              </Link>
            </Typography>
          </div>
          <Button
            onClick={send}
            action={props.valid}
            disabled={isTransactionInProgress}
            elevated
          >
            {isTransactionInProgress ? (
              <CircularProgress size={22} />
            ) : (
              'Approve and proceed with transaction'
            )}
          </Button>
        </>
      )}

      <div className={classes.poweredBy}>
        <PoweredByIcon color={'white'} />
      </div>
    </div>
  );
}

export default Send;