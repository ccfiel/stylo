// Copyright 2015-2020 Parity Technologies (UK) Ltd.
// Modifications Copyright (c) 2021 Thibaut Sardan

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import { NavigationProp, useNavigation } from '@react-navigation/native';
import AccountCard from 'components/AccountCard';
import AccountSeed from 'components/AccountSeed';
import Button from 'components/Button';
import DerivationPathField from 'components/DerivationPathField';
import KeyboardScrollView from 'components/KeyboardScrollView';
import { NetworkCard } from 'components/NetworkCard';
import ScreenHeading from 'components/ScreenHeading';
import TextInput from 'components/TextInput';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import colors from 'styles/colors';
import fontStyles from 'styles/fontStyles';
import { isSubstrateNetwork, SubstrateNetworkParams  } from 'types/networkTypes';
import { RootStackParamList } from 'types/routes';
import { emptyAccount, validateSeed } from 'utils/account';
import { alertError, alertRisks } from 'utils/alertUtils';
import { debounce } from 'utils/debounce';
import { brainWalletAddress, substrateAddress } from 'utils/native';
import { constructSURI } from 'utils/suri';

import { AccountsContext, AlertContext, NetworksContext } from '../context';

interface OnDerivationType {
	derivationPassword: string;
	derivationPath: string;
	isDerivationPathValid: boolean;
}

function RecoverAccount(): React.ReactElement {
	const [derivationPath, setDerivationPath] = useState('');
	const [derivationPassword, setDerivationPassword] = useState('');
	const [isDerivationPathValid, setIsDerivationPathValid] = useState(true);
	const { accountExists, newAccount, updateNew } = useContext(AccountsContext);
	const defaultSeedValidObject = validateSeed('', false);
	const [isSeedValid, setIsSeedValid] = useState(defaultSeedValidObject);
	const [seedPhrase, setSeedPhrase] = useState('');
	const { setAlert } = useContext(AlertContext);
	const { getNetwork } = useContext(NetworksContext)
	const selectedNetwork = useMemo(() => getNetwork(newAccount.networkKey), [getNetwork, newAccount.networkKey])
	const { navigate } = useNavigation<NavigationProp<RootStackParamList>>()
	const accountAlreadyExists = useMemo(() => accountExists(newAccount.address, selectedNetwork), [accountExists, newAccount.address, selectedNetwork])
	const isSubstrate = useMemo(() => isSubstrateNetwork(selectedNetwork), [selectedNetwork])

	const goToPin = useCallback(() => navigate('AccountPin', { isNew: true }), [navigate])

	useEffect((): void => {
		updateNew(emptyAccount('', ''));
	}, [updateNew]);

	const onSeedTextInput = (inputSeedPhrase: string): void => {
		const trimmedSeed = inputSeedPhrase.trimEnd();

		setSeedPhrase(trimmedSeed);

		const addressGeneration = (): Promise<void> =>
			brainWalletAddress(trimmedSeed)
				.then(({ bip39 }) => {
					setIsSeedValid(validateSeed(trimmedSeed, bip39));
					generateAddress()
				})
				.catch(() => setIsSeedValid(defaultSeedValidObject));
		const debouncedAddressGeneration = debounce(addressGeneration, 200);

		debouncedAddressGeneration();
	};

	const generateAddress = useCallback(() => {

		if (!selectedNetwork) {
			console.warn('No network selected')

			return null
		}

		if (!isSubstrate) {
			brainWalletAddress(seedPhrase)
				.then(({ address, bip39 }) => {
					updateNew({
						address,
						seed: seedPhrase,
						seedPhrase,
						validBip39Seed: bip39
					})
				})
				.catch(console.error);
		} else {
			if (!seedPhrase){
				return;
			}

			// Substrate
			try {
				const { prefix } = selectedNetwork as SubstrateNetworkParams
				const suri = constructSURI({
					derivePath: derivationPath,
					password: derivationPassword,
					phrase: seedPhrase
				});

				substrateAddress(suri, prefix)
					.then(address => {
						updateNew({
							address,
							derivationPassword,
							derivationPath,
							seed: suri,
							seedPhrase,
							validBip39Seed: true
						});
					})
					.catch((e) => {
						//invalid phrase
						console.error('invalid phrase', e)
					});
			} catch (e) {
				// invalid phrase or derivation path
				console.error('invalid phrase or path', e)
			}
		}
	}, [derivationPassword, derivationPath, isSubstrate, seedPhrase, selectedNetwork, updateNew]);

	useEffect(() => {
		isSeedValid.bip39 && isDerivationPathValid && generateAddress()
	}, [generateAddress, isDerivationPathValid, isSeedValid.bip39, derivationPath, derivationPassword])

	const onRecoverAccount = (): void => {
		goToPin()
	};

	const onRecoverConfirm = (): void | Promise<void> => {
		if (!isSeedValid.valid) {
			if (isSeedValid.accountRecoveryAllowed) {
				return alertRisks(setAlert, `${isSeedValid.reason}`, onRecoverAccount);
			} else {
				return alertError(setAlert, `${isSeedValid.reason}`);
			}
		}

		return onRecoverAccount();
	};

	const onDerivationChange = useCallback(({ derivationPassword, derivationPath, isDerivationPathValid }: OnDerivationType) => {
		setDerivationPassword(derivationPassword)
		setDerivationPath(derivationPath)
		setIsDerivationPathValid(isDerivationPathValid)
	}, [])

	const { address, name, networkKey } = newAccount;

	return (
		<KeyboardScrollView>
			<ScreenHeading title={'Recover Account'} />
			<View style={styles.step}>
				<Text style={styles.title}>Name</Text>
				<TextInput
					onChangeText={(input: string): void =>
						updateNew({ name: input })
					}
					placeholder="new name"
					value={name}
				/>
			</View>
			<View style={styles.step}>
				<Text style={styles.title}>Network</Text>
				<NetworkCard
					networkKey={networkKey}
					onPress={(): void => navigate('NetworkList')}
					title={selectedNetwork?.title || 'Select Network'}
				/>
			</View>
			<View style={styles.step}>
				<Text style={styles.title}>Secret Phrase</Text>
				<AccountSeed
					onChangeText={onSeedTextInput}
					returnKeyType="done"
					valid={isSeedValid.bip39}
				/>
			</View>
			{isSubstrate && (
				<View style={styles.step}>
					<DerivationPathField
						onChange={onDerivationChange}
						styles={styles}
						value={`${derivationPath}${derivationPassword ? '///' : '' }${derivationPassword}`}
					/>
				</View>
			)}
			{ isSeedValid.bip39 && !!networkKey && !!address && !accountAlreadyExists && (
				<View style={styles.step}>
					<AccountCard
						address={address}
						derivationPath={derivationPath}
						networkKey={networkKey}
						title={name || '<no name>'}
					/>
				</View>
			)}
			{ accountAlreadyExists && (
				<View style={styles.step}>
					<Text style={styles.errorText}>
						An account with this secret phrase already exists.
					</Text>
				</View>
			)}
			{ !isDerivationPathValid && (
				<View style={styles.step}>
					<Text style={styles.errorText}>
						Invalid derivation path.
					</Text>
				</View>
			)}
			<View style={styles.btnBox}>
				<Button
					disabled={!isSeedValid.bip39 || !networkKey || !address || accountAlreadyExists || !isDerivationPathValid}
					onPress={onRecoverConfirm}
					small={true}
					title="Recover"
				/>
			</View>
		</KeyboardScrollView>
	);
}

export default RecoverAccount;

const styles = StyleSheet.create({
	body: {
		backgroundColor: colors.background.app,
		flex: 1,
		overflow: 'hidden'
	},
	btnBox: {
		alignContent: 'center',
		marginTop: 10
	},
	errorText:{
		color: colors.signal.error,
		fontSize: 20,
		textAlign: 'center'
	},
	step: {
		padding: 16
	},
	title: {
		...fontStyles.h_subheading,
		color: colors.text.main
	}
});
