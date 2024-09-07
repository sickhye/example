import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { useTranslation, getLocale } from '@/i18n/client'
import { createWallet, injectedProvider } from 'thirdweb/wallets'
import { download } from 'thirdweb/storage'
import { client, sbtPreContract, sbtContract, sbtCommunityPreContract, geekChainId } from 'utils/setup'
import Breadcrumbs from 'CommonElements/Breadcrumbs'
import { prepareEvent, readContract, getContractEvents } from 'thirdweb'
import { useActiveWallet, MediaRenderer } from 'thirdweb/react'
import { Card, CardHeader, CardBody, Col, Container, Row, Button } from 'reactstrap'
import CustomModal from '@/components/CustomModal'
import { LogosMetamaskIcon, formatAddress } from '@/components/Metamask/Wallet'
import { parseTokenId, sbtImage, sbtShortName } from 'utils/parser'
import { useRouter } from 'next/router'
import { APIErrorResponse, DelitheSBTResponse } from '@/models'
import { ClipLoader } from 'react-spinners'
import { format } from 'numerable'

enum TokenType {
  SOCIAL,
  GAME,
  COMMUNITY,
}

const ExternalLink = () => {
  const { t } = useTranslation('common')
  const [isLoading, setIsLoading] = useState(true)
  const locale = getLocale()
  const [metamaskWallet, setMetamaskWallet] = useState('')
  const [activeModal, setActiveModal] = useState<
    'none' | 'import' | 'issue' | 'loading' | 'completion' | 'noCode' | 'error'
  >('none')
  const [importModalType, setImportModalType] = useState<'initial' | 'completion'>('initial')

  // SBT import
  const [tokenUris, setTokenUris] = useState<any[][]>([])
  const [data, setData] = useState<any[]>([])
  const [sbtToMint, setSbtToMint] = useState<any[]>([])
  const [refresh, setRefresh] = useState(false)
  const [eventTokenIds, setEventTokenIds] = useState<number[][]>([])
  const [eventTokenIds2, setEventTokenIds2] = useState<number[][]>([])
  const [communityEventTokenIds, setCommunityEventTokenIds] = useState<number[][]>([])
  const [communityEventTokenIds2, setCommunityEventTokenIds2] = useState<number[][]>([])
  const [indicesToRemove, setIndicesToRemove] = useState<number[]>([])
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [sbtPreEvent, setSbtPreEvent] = useState<any[]>([])
  const [sbtCommunityPreEvent, setSbtCommunityPreEvent] = useState<any[]>([])
  const router = useRouter()
  const [address, setAddress] = useState<string | undefined>()
  const [finalData, setFinalData] = useState<any[]>([])
  const wallet = useActiveWallet()

  const [errorContent, setErrorContent] = useState<React.ReactNode>('')
  const [delitheSBTResponse, setDelitheSBTResponse] = useState<DelitheSBTResponse | null>(null)

  const [isSbtConfirmation, setIsSbtConfirmation] = useState(false)

  const openModal = (modalType: 'import' | 'issue' | 'loading' | 'completion' | 'noCode' | 'error') =>
    setActiveModal(modalType)

  const closeModal = () => setActiveModal('none')

  const handleImportModalContent = async () => {
    closeModal()
    openModal('loading')
    try {
      const result = await mintSbt()
      console.log('result', result)
      if (result) {
        closeModal()
        openModal('completion')
      }
    } catch (error) {
      console.error('Error during minting or refreshing:', error)
      setErrorContent(error.message)
      openModal('error')
      closeModal()
    }
  }

  const handleImportCancelClick = () => {
    closeModal()
    setTimeout(() => {
      setImportModalType('initial')
    }, 500)
  }

  const handleRedirectSBT = async () => {
    await apiSbtRefresh()
    router.push(`/game-wallet?tab=SBT&currency=${geekChainId}`).then()
  }

  const apiSbtRefresh = async () => {
    const response = await fetch('/api/delithe-sbt-refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wallet: address,
      }),
    })
    if (!response.ok) {
      console.log('Network response was not ok')
    }
  }

  const delitheSbtMint = async () => {
    closeModal()
    openModal('loading')
    if (delitheSBTResponse) {
      try {
        const response = await fetch('/api/delithe-sbt-mint', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chainId: sbtContract.chain.id,
            contract: sbtContract.address,
            args: [
              wallet!.getAccount()!.address,
              delitheSBTResponse.meta.category,
              1,
              delitheSBTResponse.guid,
              [],
              TokenType.GAME,
            ],
          }),
        })
        console.log(response.ok)
        // エラーログを判定
        if (!response.ok) {
          const apiErrorResponse = await response.json()
          console.log(apiErrorResponse)
          setErrorContent(t('extLink.error8'))
          closeModal()
          openModal('error')
        }
        closeModal()
        openModal('completion')
      } catch (error) {
        console.log(error)
      }
    } else {
      closeModal()
      setErrorContent(t('extLink.error8'))
    }
  }

  const handleCompletionModalOkClick = () => {
    setDelitheSBTResponse(null)
    closeModal() // モーダルを閉じる
  }

  useEffect(() => {
    if (!wallet) return
    setAddress(wallet.getAccount()?.address)
  }, [wallet])

  useEffect(() => {
    if (!metamaskWallet) return
    console.log('metamaskWallet', metamaskWallet)

    const refreshEvents = async () => {
      const event = prepareEvent({
        signature: 'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
        filters: {
          to: metamaskWallet,
        },
      })

      const events = await getContractEvents({
        contract: sbtPreContract,
        events: [event],
        blockRange: BigInt(1500000),
      })

      const communityEvents = await getContractEvents({
        contract: sbtCommunityPreContract,
        events: [event],
        blockRange: BigInt(1500000),
      })

      console.log('refreshed events', events)
      setSbtPreEvent(events)
      setSbtCommunityPreEvent(communityEvents)
    }

    refreshEvents().then()
  }, [metamaskWallet])

  const getMetamaskWallet = async () => {
    const metamask = createWallet('io.metamask')

    let account
    if (injectedProvider('io.metamask')) {
      account = await metamask.connect({ client })
    } else {
      account = await metamask.connect({
        client,
      })
    }

    console.log('account', account)
    if (account) {
      setMetamaskWallet(account.address)
    }
  }

  const getTokenIds = (events: any): number[] => {
    if (!events) return []
    return events.map((event: any) => event.args.tokenId)
  }

  function compressArray(arr: []) {
    const counts = arr.reduce((acc, item) => {
      // @ts-ignore
      acc[item] = (acc[item] || 0) + 1
      return acc
    }, [])

    // @ts-ignore
    return Object.keys(counts).map((key) => [key, counts[key]])
  }

  // @ts-ignore
  function countOccurrencesWithValues(arr1, arr3) {
    // @ts-ignore
    const counts = arr1.reduce((acc, item, index) => {
      if (!acc[item]) {
        acc[item] = { count: 0, values: [], values2: [], values3: [] }
      }
      acc[item].count += 1
      // acc[item].values.push(Number(arr2[item]))
      acc[item].values2.push(Number(arr3[index][0]))
      acc[item].values3.push(data[index][1])
      return acc
    }, {})

    return Object.keys(counts).map((key) => [
      key,
      counts[key].count,
      counts[key].values,
      counts[key].values2,
      counts[key].values3,
    ])
  }

  function countOccurrences(arr: any[]) {
    const occurrences = arr.reduce((acc, item) => {
      if (acc[item]) {
        acc[item][1] += 1
      } else {
        acc[item] = [item, 1]
      }
      return acc
    }, {})

    return Object.values(occurrences)
  }

  useEffect(() => {
    console.log('isLoading', isLoading)
  }, [isLoading])

  useEffect(() => {
    console.log('sbtPreEvent', sbtPreEvent)
    let preEventIds: any = []
    if (sbtPreEvent && sbtPreEvent.length > 0) {
      preEventIds = getTokenIds(sbtPreEvent)
    }
    setEventTokenIds(compressArray(preEventIds))
  }, [sbtPreEvent])

  useEffect(() => {
    console.log('sbtCommunityPreEvent', sbtCommunityPreEvent)
    let communityPreEventIds: any = []
    if (sbtCommunityPreEvent && sbtCommunityPreEvent.length > 0) {
      communityPreEventIds = getTokenIds(sbtCommunityPreEvent)
    }
    setCommunityEventTokenIds(compressArray(communityPreEventIds))
  }, [sbtCommunityPreEvent])

  const getTokenUris = async (tokenIds: number[][], contract: any) => {
    return await Promise.all(
      tokenIds.map(async (tokenId) => {
        return await readContract({
          contract: contract,
          method: 'function tokenURI(uint256 tokenId) view returns (string)',
          params: [BigInt(tokenId[0])],
        })
      }),
    )
  }

  useEffect(() => {
    const minted2 = eventTokenIds.map(async (sbtId: any) => {
      return await readContract({
        contract: sbtContract,
        method: 'function minted(uint256 id) view returns (bool)',
        params: [sbtId[0]],
      })
    })

    Promise.all(minted2).then((minted) => {
      console.log('minted2', minted)
      const eventTokenIds2 = eventTokenIds.filter((_, index) => !minted[index])
      console.log('eventTokenIds2', eventTokenIds2)
      setEventTokenIds2(eventTokenIds2)
    })

    const minted3 = communityEventTokenIds.map(async (sbtId: any) => {
      return await readContract({
        contract: sbtContract,
        method: 'function communityMinted(uint256 id) view returns (bool)',
        params: [sbtId[0]],
      })
    })

    Promise.all(minted3).then((minted) => {
      console.log('minted3', minted)
      const eventTokenIds3 = communityEventTokenIds.filter((_, index) => !minted[index])
      console.log('eventTokenIds3', eventTokenIds3)
      setCommunityEventTokenIds2(eventTokenIds3)
    })
  }, [eventTokenIds, communityEventTokenIds])

  useEffect(() => {
    const fetchTokenUris = async () => {
      try {
        const uris = await getTokenUris(eventTokenIds2, sbtPreContract)
        const communityUris = await getTokenUris(communityEventTokenIds2, sbtCommunityPreContract)

        console.log('uris', uris)
        console.log('communityUris', communityUris)
        // @ts-ignore
        setTokenUris([uris, communityUris])
      } catch (error) {
        console.error('Error fetching token URIs:', error)
      } finally {
      }
    }

    if (communityEventTokenIds2.length > 0 || eventTokenIds2.length > 0) {
      fetchTokenUris().then()
    }
  }, [eventTokenIds2, communityEventTokenIds2])

  const extractTokenId = (uri: string) => {
    const match = uri.match(/\/(\d+)$/)

    if (match) {
      const number = match[1]
      console.log('num', number)
      return number
    } else {
      console.log("Can't find tokenId.")
    }
  }

  useEffect(() => {
    setIsLoading(true)
    console.log('Token URIs:', tokenUris)

    if (tokenUris.length === 0) return
    const fetchMeta = async () => {
      const response = await fetch('api/fetch-with-cors/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: tokenUris[0],
        }),
      })

      const result = await response.json()

      console.log('response', result.result)

      const communityMeta = tokenUris[1].map(async (uri) => {
        const file = await download({
          client,
          uri: uri.trim(),
        })
        const data = await file.json()
        return [extractTokenId(uri), data.image]
      })

      const merged = result.result.concat(communityMeta)
      Promise.all(merged).then((data) => {
        console.log('DDDD', data)
        setData(data)
        setIsLoading(false)
      })
    }
    fetchMeta().then()
  }, [tokenUris])

  useEffect(() => {
    const sbtToMint = []
    const unSupport = []
    for (let i = 0; i < data.length; i++) {
      const datum = data[i]
      const tokenId = parseTokenId(datum[0])
      console.log('sbtToMint:datum', datum)
      console.log('sbtToMint:tokenID', tokenId)
      if (tokenId >= 1) {
        sbtToMint.push(tokenId)
      } else {
        unSupport.push(i)
      }
    }
    unSupport.sort((a, b) => b - a)
    for (const index of unSupport) {
      if (index > -1 && index < data.length) {
        data.splice(index, 1)
      }
    }
    setIndicesToRemove(unSupport)
    setSbtToMint(sbtToMint)
  }, [data])

  useEffect(() => {
    if (!wallet) return
    if (!metamaskWallet) return
    console.log('sbtToMint', sbtToMint)

    const sbtToMint2 = countOccurrences(sbtToMint)

    console.log('sbtToMint2', sbtToMint2)

    const minted = sbtToMint2.map(async (sbtId: any) => {
      return await readContract({
        contract: sbtContract,
        method: 'function balanceOf(address _owner, uint256 _id) view returns (uint256)',
        params: [wallet!.getAccount()!.address, sbtId[0]],
      })
    })

    Promise.all(minted).then((minted) => {
      const sbtToMint3 = sbtToMint2.map((sbtId: any, index: number) => {
        return sbtId[1] - Number(minted[index])
      })

      console.log('sbtToMint3', sbtToMint3)
      console.log('minted', minted)

      const mergedTokenIds = eventTokenIds2.concat(communityEventTokenIds2)
      console.log('mergedTokenIds', mergedTokenIds)
      indicesToRemove.sort((a, b) => b - a)
      for (const index of indicesToRemove) {
        if (index > -1 && index < mergedTokenIds.length) {
          mergedTokenIds.splice(index, 1)
        }
      }
      console.log('sbtToMin', sbtToMint)
      console.log('mergedTokenIds', mergedTokenIds)

      const finalData = countOccurrencesWithValues(sbtToMint, mergedTokenIds)

      finalData.map((datum, index) => {
        datum[2] = sbtToMint3[index]
      })
      setFinalData(finalData)
      if (refresh) {
        setIsLoading(false)
        setRefresh(false)
      }
      console.log('finalData', finalData)
      console.log('isLoading', isLoading)
    })
  }, [sbtToMint, wallet, refresh, metamaskWallet])

  useEffect(() => {
    if (!wallet) return
    console.log('wallet', wallet.getAccount()!.address)
  }, [wallet])

  function showNeverMinted(datum: any[]) {
    if (datum[0] < 14) {
      return true
    } else {
      return datum[1] - datum[2] === 0 && datum[2] > 0
    }
  }

  const checkNotCommunity = (datum: any[]) => {
    return datum[0] <= 13
  }

  const mintSbt = async () => {
    console.log('finalData', finalData)
    let fCheck = false
    let tCheck = false

    for (let i = 0; i < finalData.length; i++) {
      if (finalData[i][2] > 0) {
        const tokenType = finalData[i][0] > 13 ? TokenType.COMMUNITY : TokenType.SOCIAL
        console.log('oldIds', finalData[i][3])
        console.log('id', Number(finalData[i][0]))
        const quantity = tokenType === TokenType.COMMUNITY ? 1 : finalData[i][2]

        try {
          const response = await fetch('/api/engine/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chainId: sbtContract.chain.id,
              contract: sbtContract.address,
              args: [
                wallet!.getAccount()!.address,
                Number(finalData[i][0]),
                quantity,
                '',
                finalData[i][3], // oldIds
                tokenType,
              ],
              command: 'mint',
              externalAddress: metamaskWallet,
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error('Minting error:', errorText)
            const err = JSON.parse(errorText).error

            if (err.includes('All items are already minted')) {
              setErrorContent(t('extLink.mintModal1'))
            } else {
              setErrorContent(err)
            }
            openModal('error')
            fCheck = true
          } else {
            tCheck = true
          }
        } catch (error) {
          console.error('Error during minting:', error)
          setErrorContent('An unexpected error occurred during minting.')
          openModal('error')
          fCheck = true
        }
      }
    }

    return tCheck || !fCheck
  }

  useEffect(() => {
    console.log('sbtPreEvent', sbtPreEvent)
  }, [sbtPreEvent])

  const delitheSbtCheck = async () => {
    if (code && password) {
      setIsSbtConfirmation(false)
      closeModal()
      // openModal('loading')
      try {
        const response = await fetch('/api/delithe-sbt-check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            password,
            chainId: sbtContract.chain.id,
            contract: sbtContract.address,
            wallet: wallet!.getAccount()!.address,
          }),
        })

        // エラーログを判定
        if (!response.ok) {
          const apiErrorResponse: APIErrorResponse = await response.json()
          // エラーコードに応じて処理を分ける
          const errMessage = apiErrorResponse.detail
          if (errMessage.includes('NOT_ENOUGH_POWER')) {
            setErrorContent(t('extLink.error1'))
          } else if (errMessage.includes('CODE_NOT_EXISTS')) {
            setErrorContent(t('extLink.error2'))
          } else if (errMessage.includes('INVALID_CODE')) {
            setErrorContent(t('extLink.error3'))
          } else if (errMessage.includes('ALREADY_USED')) {
            setErrorContent(t('extLink.error4'))
          } else if (errMessage.includes('PLAYER_NOT_EXISTS')) {
            setErrorContent(t('extLink.error5'))
          } else if (errMessage.includes('ALREADY_MINTED')) {
            setIsSbtConfirmation(true)
            setErrorContent(
              <span className='w-full m-auto bg-[#EEEDF1] py-4 rounded col-md-10 whitespace-nowrap !px-0'>
                {t('extLink.error6')}
              </span>,
            )
          } else if (errMessage.includes('CODE_USED')) {
            setErrorContent(t('extLink.error7'))
          }
          closeModal()
          openModal('error')
          return
        }
        const apiResult: DelitheSBTResponse = await response.json()
        // 成功時のデータを利用してモーダルを表示するなどの処理を行う
        console.log('Success:', apiResult)
        if (apiResult.power < 1000000) {
          setErrorContent('Power value is below the required threshold of 1,000,000.')
          openModal('error') // エラーモーダルを表示
          return // 処理を中止
        } else {
          setDelitheSBTResponse(apiResult)
        }
        openModal('issue')
      } catch (error) {
        console.log(error.message)
      }
    } else {
      closeModal()
      openModal('noCode')
    }
  }

  const allMinted = () => {
    console.log('final data', finalData)
    if (finalData.length) {
      return finalData.filter((datum) => datum[2] > 0).filter((datum) => showNeverMinted(datum)).length === 0
    } else {
      return true
    }
  }

  return (
    <div className='page-body'>
      <Breadcrumbs title={t('extLink.ExternalLink')} mainTitle={t('extLink.ExternalLink')} parent='Menu' />
      <Container fluid>
        <Row>
          <Col xl='8' className='mx-auto'>
            <Card>
              <CardHeader>
                <div className='header-top'>
                  <h5>{t('extLink.wallet')}</h5>
                  {metamaskWallet && (
                    <i
                      className='icofont icofont-exit text-l cursor-pointer'
                      onClick={() => {
                        if (wallet) {
                          setMetamaskWallet('')
                          setData([])
                          setCommunityEventTokenIds([])
                          setCommunityEventTokenIds2([])
                          setEventTokenIds([])
                          setEventTokenIds2([])
                          setFinalData([])
                        }
                      }}
                    >
                      {t('extLink.DisconnectWallet')}
                    </i>
                  )}
                </div>
              </CardHeader>
              <CardBody className='pt-0'>
                <Col md='6' className='mx-auto my-5'>
                  <Image src={`/img/${locale}/banner_ADP.jpg`} alt='banner_ADP' width={1200} height={630} />
                </Col>
                <Col md='7' className='mx-auto flex flex-col items-center'>
                  <div className='flex flex-col 2xl:flex-row gap-3 justify-center items-center w-full'>
                    {metamaskWallet ? (
                      <>
                        <button className='btn btn-primary btn-hover-effect f-w-500 btn_select !text-xl'>
                          <LogosMetamaskIcon className='mr-2 h-4 w-4' />
                          {formatAddress(metamaskWallet)}
                        </button>
                      </>
                    ) : (
                      <button
                        className='btn btn-primary btn-hover-effect f-w-500 btn_select !text-xl'
                        onClick={getMetamaskWallet}
                      >
                        {t('extLink.ConnectWallet')}
                      </button>
                    )}
                    <button
                      className='btn btn-primary btn-hover-effect f-w-500 btn_select !text-xl'
                      onClick={() => {
                        if (metamaskWallet) {
                          setIsLoading(true)
                          openModal('import')
                          setRefresh(true)
                        } else {
                          setErrorContent(
                            <>
                              {t('extLink.metamaskNotConnected1')}
                              <br />
                              {t('extLink.metamaskNotConnected2')}
                            </>,
                          )
                          openModal('error')
                        }
                      }}
                    >
                      {t('extLink.sbtImport')}
                    </button>
                    <button
                      className='btn btn-primary btn-hover-effect f-w-500 btn_select !text-xl'
                      onClick={handleRedirectSBT}
                    >
                      {t('extLink.confirmation')}
                    </button>
                  </div>
                </Col>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <h5>{t('extLink.Benefits')}</h5>
              </CardHeader>
              <CardBody>
                <Col md='6' className='mx-auto my-5'>
                  <Image src={`/img/${locale}/banner_virgo.jpg`} alt='banner_virgo' width={1200} height={586} />
                </Col>
                <Col md={7} className='m-auto'>
                  <p className='mb-3 f-light'>
                    {t('extLink.note1')}
                    <br />
                    <br />
                    {t('extLink.note2')}
                    <br />
                    <br />
                    {t('extLink.note3')}
                    <br />
                    {t('extLink.note4')}
                  </p>
                </Col>
                <Col md={8} className='m-auto bg-[#EEEDF1] p-4 rounded'>
                  <div className='mb-3 flex flex-col 2xl:flex-row items-center gap-x-3 justify-between'>
                    <label htmlFor='money' className='f-light form-label text-[#878787] text-lg whitespace-nowrap'>
                      {t('extLink.code')}
                    </label>
                    <div className='position-relative w-full xl:w-[400px]'>
                      <input
                        id='money'
                        placeholder={t('extLink.pleaseEnterCode')}
                        type='text'
                        className='form-control form-control text-lg'
                        name='code'
                        onChange={(e) => {
                          setCode(e.target.value)
                        }}
                      />
                    </div>
                  </div>
                  <div className='flex flex-col 2xl:flex-row items-center gap-x-3 justify-between'>
                    <label htmlFor='coin' className='f-light form-label text-[#878787] text-lg whitespace-nowrap'>
                      {t('extLink.password')}
                    </label>
                    <div className='position-relative w-full xl:w-[400px]'>
                      <input
                        id='coin'
                        placeholder={t('extLink.pleaseEnterPassword')}
                        type='password'
                        className='form-control form-control text-lg'
                        name='password'
                        onChange={(e) => {
                          setPassword(e.target.value)
                        }}
                      />
                    </div>
                  </div>
                </Col>
                <div className='m-auto mt-4 flex justify-center'>
                  <button
                    className='btn btn-primary btn-hover-effect f-w-500 btn_select_long !text-xl'
                    onClick={() => delitheSbtCheck()}
                  >
                    {t('extLink.issue')}
                  </button>
                </div>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>

      <CustomModal
        isOpen={activeModal === 'import'}
        toggle={closeModal}
        title={t('extLink.sbtImport')}
        body={
          importModalType === 'initial' ? (
            <div className='modal-toggle-wrapper'>
              <p className='text-center whitespace-pre-wrap'>
                {`${t('extLink.sbtImportNote1')}\n${t('extLink.sbtImportNote2')}`}
              </p>
              <Card className='!mx-[30px] '>
                <CardBody className='gallery my-gallery row no-bg-img no-bg-color !bg-[#EEEDF1] p-[20px] rounded-xl h-[270px] overflow-auto gap-y-3'>
                  {!allMinted() &&
                    finalData
                      .filter((datum) => datum[2] > 0)
                      .filter((datum) => showNeverMinted(datum))
                      .map((datum, index) => {
                        if (datum[4][0].startsWith('ipfs://')) {
                          return (
                            <Col xs='6' md='3' key={index}>
                              <MediaRenderer
                                width='505'
                                height='570'
                                client={client}
                                src={sbtImage[datum[0]]}
                                className='w-full !object-cover aspect-[1/1.1287128712871286]'
                              />
                              <p className='text-center'>{sbtShortName[datum[0]]}</p>
                              {checkNotCommunity(datum) && datum[2] > 1 && (
                                <p className='text-white bg-[#666] px-[10px] py-1 rounded absolute left-0 top-0'>
                                  x{datum[2]}
                                </p>
                              )}
                            </Col>
                          )
                        } else {
                          return (
                            <Col xs='6' md='3' key={index}>
                              <Image
                                width='505'
                                height='570'
                                className='w-full !object-cover aspect-[1/1.1287128712871286]'
                                src={sbtImage[datum[0]]!}
                                alt={`${index}`}
                              />
                              <p className='text-center'>
                                {sbtShortName[datum[0]]} {datum[2] > 1 ? `X ${datum[2]}` : ''}
                              </p>
                              {checkNotCommunity(datum) && datum[2] > 1 && (
                                <p className='text-white bg-[#666] px-[10px] py-1 rounded absolute left-0 top-0'>
                                  x{datum[2]}
                                </p>
                              )}
                            </Col>
                          )
                        }
                      })}
                  {(() => {
                    if (isLoading) {
                      if (data.length === 0) {
                        return (
                          <div className='flex flex-col items-center justify-center'>
                            <p className='text-center'>
                              <ClipLoader color={'#123abc'} loading={true} size={50} />
                            </p>
                            <p className='text-center text-xl'>{t('extLink.Loading')}</p>
                          </div>
                        )
                      } else {
                        setIsLoading(false)
                      }
                    } else {
                      if (data.length > 0 && allMinted()) {
                        return (
                          <div className='flex items-center justify-center'>
                            <p className='text-center text-xl'>{t('extLink.noSBT')}</p>
                          </div>
                        )
                      } else if (data.length === 0) {
                        return (
                          <div className='flex items-center justify-center'>
                            <p className='text-center text-xl'>{t('extLink.noSBT')}</p>
                          </div>
                        )
                      }
                    }
                  })()}
                </CardBody>
              </Card>
              <div className='flex justify-center gap-x-5 mt-5'>
                {allMinted() ? (
                  <Button className='btn-hover-effect f-w-500 btn_sub !text-xl' onClick={handleImportCancelClick}>
                    {t('extLink.cancel')}
                  </Button>
                ) : (
                  <>
                    <Button className='btn-hover-effect f-w-500 btn_sub !text-xl' onClick={handleImportCancelClick}>
                      {t('extLink.cancel')}
                    </Button>
                    <Button className='btn-hover-effect f-w-500 btn_select !text-xl' onClick={handleImportModalContent}>
                      {t('extLink.ok')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className='modal-toggle-wrapper'>
                <p className='text-center'>{t('extLink.sbtImportCompletion')}</p>
                <Card className='!mx-[30px]'>
                  <CardBody className='gallery my-gallery row no-bg-img no-bg-color !bg-[#EEEDF1] p-[20px] rounded-xl h-[270px] overflow-auto'></CardBody>
                </Card>
              </div>
              <div className='flex justify-center gap-x-5 mt-5'>
                <Button className='btn-hover-effect f-w-500 btn_select !text-xl' onClick={handleImportCancelClick}>
                  {t('extLink.ok')}
                </Button>
              </div>
            </>
          )
        }
      />

      {/* Issue Modal */}
      <CustomModal
        isOpen={activeModal === 'issue'}
        toggle={() => setActiveModal('none')}
        title={t('extLink.issue')}
        body={
          <>
            <div className='modal-toggle-wrapper'>
              <div className='light-card balance-card mb-3 justify-center dialog_deco flex flex-col items-center'>
                <h4 className='f-light f-14 text-lg font-bold'>{delitheSBTResponse?.nickname}</h4>
                <h4 className='flex items-center m-0 text-[#7B7B7D]'>
                  <span className='f-light f-14 text-lg font-bold'>{t('extLink.CombatPower')}</span>
                  <br />
                  <span className='me-1'>{format(delitheSBTResponse?.power, '0,0')}</span>
                </h4>
              </div>
              {delitheSBTResponse?.meta && (
                <>
                  <div className='flex justify-center p-5'>
                    <Col md='3'>
                      <Image
                        width='505'
                        height='570'
                        className='w-full'
                        src={delitheSBTResponse.meta.image}
                        alt={delitheSBTResponse.meta.name}
                      />
                    </Col>
                  </div>
                  <div className='light-card balance-card mb-3 justify-center dialog_deco'>
                    <h4 className='flex items-center m-0 text-[#7B7B7D]'>
                      <span className='f-light f-14 text-lg font-bold'>{delitheSBTResponse.meta.name}</span>
                    </h4>
                  </div>
                </>
              )}
              <p className='whitespace-pre-wrap bg-[#EEEDF1] px-4 py-3 rounded'>
                {t('extLink.sbtModalNote1')}
                <br />
                {t('extLink.sbtModalNote2')}
                <br />
                <br />
                {t('extLink.sbtModalNote3')}
                <br />
                {t('extLink.sbtModalNote4')}
              </p>
            </div>
            <div className='flex justify-center gap-x-5 mt-5'>
              <Button className='btn-hover-effect f-w-500 btn_sub !text-xl' onClick={() => setActiveModal('none')}>
                {t('extLink.cancel')}
              </Button>
              <Button className='btn-hover-effect f-w-500 btn_select !text-xl' onClick={delitheSbtMint}>
                {t('extLink.ok')}
              </Button>
            </div>
          </>
        }
      />

      {/* Loading Modal */}
      <CustomModal
        isOpen={activeModal === 'loading'}
        toggle={() => setActiveModal('none')}
        title={t('extLink.issue')}
        body={
          <>
            <p className='text-center'>
              <ClipLoader color={'#123abc'} loading={true} size={50} />
            </p>
            <p className='text-center'>{t('extLink.sbtModalLoading')}</p>
          </>
        }
        footer={null}
      />

      {/* Completion Modal */}
      <CustomModal
        isOpen={activeModal === 'completion'}
        toggle={() => setActiveModal('none')}
        title={t('extLink.issue')}
        body={
          <>
            <p className='text-center'>{t('extLink.sbtModalCompletion')}</p>
            <Card className='!mx-[30px]'>
              <CardBody className='gallery my-gallery row no-bg-img no-bg-color !bg-[#EEEDF1] p-[20px] rounded-xl overflow-auto gap-y-3'>
                {delitheSBTResponse?.meta ? (
                  <>
                    <div className='flex justify-center p-5'>
                      <Col md='3'>
                        <Image
                          width='505'
                          height='570'
                          className='w-full'
                          src={delitheSBTResponse.meta.image}
                          alt={delitheSBTResponse.meta.name}
                        />
                      </Col>
                    </div>
                    <div className='light-card balance-card mb-3 justify-center dialog_deco'>
                      <h4 className='flex items-center m-0 text-[#7B7B7D]'>
                        <span className='f-light f-14 text-lg font-bold'>{delitheSBTResponse.meta.name}</span>
                      </h4>
                    </div>
                  </>
                ) : (
                  finalData
                    .filter((datum) => datum[2] > 0)
                    .filter((datum) => showNeverMinted(datum))
                    .map((datum, index) => {
                      return (
                        <Col xs='6' md='3' key={index}>
                          <Image
                            width='505'
                            height='570'
                            className='w-full'
                            src={sbtImage[datum[0]]!}
                            alt={`unknown_${index}`}
                          />
                          <p className='text-center'>{sbtShortName[datum[0]]}</p>
                          {checkNotCommunity(datum) && datum[2] > 1 && (
                            <p className='text-white bg-[#666] px-[10px] py-1 rounded absolute left-0 top-0'>
                              x{datum[2]}
                            </p>
                          )}
                        </Col>
                      )
                    })
                )}
              </CardBody>
            </Card>
          </>
        }
        footer={
          <Button className='btn-hover-effect f-w-500 btn_select !text-xl' onClick={handleCompletionModalOkClick}>
            {t('extLink.ok')}
          </Button>
        }
      />

      {/* noCode Modal */}
      <CustomModal
        isOpen={activeModal === 'noCode'}
        toggle={() => setActiveModal('none')}
        title={t('extLink.issue')}
        body={
          <>
            <p className='text-center'>{t('extLink.sbtModalError2')}</p>
          </>
        }
        footer={
          <Button className='btn-hover-effect f-w-500 btn_select !text-xl' onClick={() => setActiveModal('none')}>
            {t('extLink.ok')}
          </Button>
        }
      />

      {/* error Modal */}
      <CustomModal
        isOpen={activeModal === 'error'}
        toggle={() => setActiveModal('none')}
        title={t('extLink.issue')}
        body={
          <>
            {isSbtConfirmation && (
              <button
                className='btn btn-primary btn-hover-effect f-w-500 btn_select !text-xl mx-auto my-5'
                onClick={handleRedirectSBT}
              >
                {t('extLink.confirmation')}
              </button>
            )}
            <p className='text-center'>{errorContent}</p>
          </>
        }
        footer={
          <Button className='btn-hover-effect f-w-500 btn_select !text-xl' onClick={() => setActiveModal('none')}>
            {t('extLink.ok')}
          </Button>
        }
      />
    </div>
  )
}

export default ExternalLink
