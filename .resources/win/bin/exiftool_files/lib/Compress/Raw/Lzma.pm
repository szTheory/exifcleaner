package Compress::Raw::Lzma;

use strict ;
use warnings ;

require 5.006 ;
require Exporter;
use AutoLoader;
use Carp ;

use bytes ;
our ($VERSION, $XS_VERSION, @ISA, @EXPORT, $AUTOLOAD);

$VERSION = '2.100';
$XS_VERSION = $VERSION;
$VERSION = eval $VERSION;

@ISA = qw(Exporter);
# Items to export into callers namespace by default. Note: do not export
# names by default without a very good reason. Use EXPORT_OK instead.
# Do not simply export all your public functions/methods/constants.
@EXPORT = qw(

    LZMA_OK
    LZMA_STREAM_END
    LZMA_NO_CHECK
    LZMA_UNSUPPORTED_CHECK
    LZMA_GET_CHECK
    LZMA_MEM_ERROR
    LZMA_MEMLIMIT_ERROR
    LZMA_FORMAT_ERROR
    LZMA_OPTIONS_ERROR
    LZMA_DATA_ERROR
    LZMA_BUF_ERROR
    LZMA_PROG_ERROR

    LZMA_RUN
    LZMA_SYNC_FLUSH
    LZMA_FULL_FLUSH
    LZMA_FINISH

    LZMA_FILTER_X86
    LZMA_FILTER_POWERPC
    LZMA_FILTER_IA64
    LZMA_FILTER_ARM
    LZMA_FILTER_ARMTHUMB
    LZMA_FILTER_SPARC


    LZMA_BLOCK_HEADER_SIZE_MIN
    LZMA_BLOCK_HEADER_SIZE_MAX

    LZMA_CHECK_NONE
    LZMA_CHECK_CRC32
    LZMA_CHECK_CRC64
    LZMA_CHECK_SHA256

    LZMA_CHECK_ID_MAX
    LZMA_CHECK_SIZE_MAX

    LZMA_PRESET_DEFAULT
    LZMA_PRESET_LEVEL_MASK
    LZMA_PRESET_EXTREME

    LZMA_TELL_NO_CHECK
    LZMA_TELL_UNSUPPORTED_CHECK
    LZMA_TELL_ANY_CHECK
    LZMA_CONCATENATED


    LZMA_FILTER_DELTA
    LZMA_DELTA_DIST_MIN
    LZMA_DELTA_DIST_MAX
    LZMA_DELTA_TYPE_BYTE

    LZMA_FILTERS_MAX

    LZMA_FILTER_LZMA2

    LZMA_MF_HC3
    LZMA_MF_HC4
    LZMA_MF_BT2
    LZMA_MF_BT3
    LZMA_MF_BT4

    LZMA_MODE_FAST
    LZMA_MODE_NORMAL

    LZMA_DICT_SIZE_MIN
    LZMA_DICT_SIZE_DEFAULT

    LZMA_LCLP_MIN
    LZMA_LCLP_MAX
    LZMA_LC_DEFAULT

    LZMA_LP_DEFAULT

    LZMA_PB_MIN
    LZMA_PB_MAX
    LZMA_PB_DEFAULT

    LZMA_STREAM_HEADER_SIZE

    LZMA_BACKWARD_SIZE_MIN

    LZMA_FILTER_SUBBLOCK

    LZMA_SUBFILTER_NONE
    LZMA_SUBFILTER_SET
    LZMA_SUBFILTER_RUN
    LZMA_SUBFILTER_FINISH

    LZMA_SUBBLOCK_ALIGNMENT_MIN
    LZMA_SUBBLOCK_ALIGNMENT_MAX
    LZMA_SUBBLOCK_ALIGNMENT_DEFAULT

    LZMA_SUBBLOCK_DATA_SIZE_MIN
    LZMA_SUBBLOCK_DATA_SIZE_MAX
    LZMA_SUBBLOCK_DATA_SIZE_DEFAULT

    LZMA_SUBBLOCK_RLE_OFF
    LZMA_SUBBLOCK_RLE_MIN
    LZMA_SUBBLOCK_RLE_MAX

    LZMA_VERSION
    LZMA_VERSION_MAJOR
    LZMA_VERSION_MINOR
    LZMA_VERSION_PATCH
    LZMA_VERSION_STABILITY

    LZMA_VERSION_STABILITY_STRING
    LZMA_VERSION_STRING
    );

    #LZMA_VLI_MAX
    #LZMA_VLI_UNKNOWN
    #LZMA_VLI_BYTES_MAX

sub AUTOLOAD {
    my($constname);
    ($constname = $AUTOLOAD) =~ s/.*:://;
    my ($error, $val) = constant($constname);
    Carp::croak $error if $error;
    no strict 'refs';
    *{$AUTOLOAD} = sub { $val };
    goto &{$AUTOLOAD};

}

use constant FLAG_APPEND             => 1 ;
use constant FLAG_CRC                => 2 ;
use constant FLAG_ADLER              => 4 ;
use constant FLAG_CONSUME_INPUT      => 8 ;
use constant FLAG_LIMIT_OUTPUT       => 16 ;

eval {
    require XSLoader;
    XSLoader::load('Compress::Raw::Lzma', $XS_VERSION);
    1;
}
or do {
    require DynaLoader;
    local @ISA = qw(DynaLoader);
    bootstrap Compress::Raw::Lzma $XS_VERSION ;
};

use constant Parse_any      => 0x01;
use constant Parse_unsigned => 0x02;
use constant Parse_signed   => 0x04;
use constant Parse_boolean  => 0x08;
use constant Parse_string   => 0x10;
use constant Parse_custom   => 0x12;

use constant Parse_store_ref => 0x100 ;

use constant OFF_PARSED     => 0 ;
use constant OFF_TYPE       => 1 ;
use constant OFF_DEFAULT    => 2 ;
use constant OFF_FIXED      => 3 ;
use constant OFF_FIRST_ONLY => 4 ;
use constant OFF_STICKY     => 5 ;



sub ParseParameters
{
    my $level = shift || 0 ;

    my $sub = (caller($level + 1))[3] ;
    #local $Carp::CarpLevel = 1 ;
    my $p = new Compress::Raw::Lzma::Parameters() ;
    $p->parse(@_)
        or croak "$sub: $p->{Error}" ;

    return $p;
}


sub Compress::Raw::Lzma::Parameters::new
{
    my $class = shift ;

    my $obj = { Error => '',
                Got   => {},
              } ;

    #return bless $obj, ref($class) || $class || __PACKAGE__ ;
    return bless $obj, 'Compress::Raw::Lzma::Parameters' ;
}

sub Compress::Raw::Lzma::Parameters::setError
{
    my $self = shift ;
    my $error = shift ;
    my $retval = @_ ? shift : undef ;

    $self->{Error} = $error ;
    return $retval;
}

#sub getError
#{
#    my $self = shift ;
#    return $self->{Error} ;
#}

sub Compress::Raw::Lzma::Parameters::parse
{
    my $self = shift ;

    my $default = shift ;

    my $got = $self->{Got} ;
    my $firstTime = keys %{ $got } == 0 ;

    my (@Bad) ;
    my @entered = () ;

    # Allow the options to be passed as a hash reference or
    # as the complete hash.
    if (@_ == 0) {
        @entered = () ;
    }
    elsif (@_ == 1) {
        my $href = $_[0] ;
        return $self->setError("Expected even number of parameters, got 1")
            if ! defined $href or ! ref $href or ref $href ne "HASH" ;

        foreach my $key (keys %$href) {
            push @entered, $key ;
            push @entered, \$href->{$key} ;
        }
    }
    else {
        my $count = @_;
        return $self->setError("Expected even number of parameters, got $count")
            if $count % 2 != 0 ;

        for my $i (0.. $count / 2 - 1) {
            push @entered, $_[2* $i] ;
            push @entered, \$_[2* $i+1] ;
        }
    }


    while (my ($key, $v) = each %$default)
    {
        croak "need 4 params [@$v]"
            if @$v != 4 ;

        my ($first_only, $sticky, $type, $value) = @$v ;
        my $x ;
        $self->_checkType($key, \$value, $type, 0, \$x)
            or return undef ;

        $key = lc $key;

        if ($firstTime || ! $sticky) {
            $got->{$key} = [0, $type, $value, $x, $first_only, $sticky] ;
        }

        $got->{$key}[OFF_PARSED] = 0 ;
    }

    for my $i (0.. @entered / 2 - 1) {
        my $key = $entered[2* $i] ;
        my $value = $entered[2* $i+1] ;

        #print "Key [$key] Value [$value]" ;
        #print defined $$value ? "[$$value]\n" : "[undef]\n";

        $key =~ s/^-// ;
        my $canonkey = lc $key;

        if ($got->{$canonkey} && ($firstTime ||
                                  ! $got->{$canonkey}[OFF_FIRST_ONLY]  ))
        {
            my $type = $got->{$canonkey}[OFF_TYPE] ;
            my $s ;
            $self->_checkType($key, $value, $type, 1, \$s)
                or return undef ;
            #$value = $$value unless $type & Parse_store_ref ;
            $value = $$value ;
            $got->{$canonkey} = [1, $type, $value, $s] ;
        }
        else
          { push (@Bad, $key) }
    }

    if (@Bad) {
        my ($bad) = join(", ", @Bad) ;
        return $self->setError("unknown key value(s) @Bad") ;
    }

    return 1;
}

sub Compress::Raw::Lzma::Parameters::_checkType
{
    my $self = shift ;

    my $key   = shift ;
    my $value = shift ;
    my $type  = shift ;
    my $validate  = shift ;
    my $output  = shift;

    #local $Carp::CarpLevel = $level ;
    #print "PARSE $type $key $value $validate $sub\n" ;
    if ( $type & Parse_store_ref)
    {
        #$value = $$value
        #    if ref ${ $value } ;

        $$output = $value ;
        return 1;
    }

    $value = $$value ;

    if ($type & Parse_any)
    {
        $$output = $value ;
        return 1;
    }
    elsif ($type & Parse_unsigned)
    {
        return $self->setError("Parameter '$key' must be an unsigned int, got 'undef'")
            if $validate && ! defined $value ;
        return $self->setError("Parameter '$key' must be an unsigned int, got '$value'")
            if $validate && $value !~ /^\d+$/;

        $$output = defined $value ? $value : 0 ;
        return 1;
    }
    elsif ($type & Parse_signed)
    {
        return $self->setError("Parameter '$key' must be a signed int, got 'undef'")
            if $validate && ! defined $value ;
        return $self->setError("Parameter '$key' must be a signed int, got '$value'")
            if $validate && $value !~ /^-?\d+$/;

        $$output = defined $value ? $value : 0 ;
        return 1 ;
    }
    elsif ($type & Parse_boolean)
    {
        return $self->setError("Parameter '$key' must be an int, got '$value'")
            if $validate && defined $value && $value !~ /^\d*$/;
        $$output =  defined $value ? $value != 0 : 0 ;
        return 1;
    }
    elsif ($type & Parse_string)
    {
        $$output = defined $value ? $value : "" ;
        return 1;
    }

    $$output = $value ;
    return 1;
}



sub Compress::Raw::Lzma::Parameters::parsed
{
    my $self = shift ;
    my $name = shift ;

    return $self->{Got}{lc $name}[OFF_PARSED] ;
}

sub Compress::Raw::Lzma::Parameters::value
{
    my $self = shift ;
    my $name = shift ;

    if (@_)
    {
        $self->{Got}{lc $name}[OFF_PARSED]  = 1;
        $self->{Got}{lc $name}[OFF_DEFAULT] = $_[0] ;
        $self->{Got}{lc $name}[OFF_FIXED]   = $_[0] ;
    }

    return $self->{Got}{lc $name}[OFF_FIXED] ;
}


sub Compress::Raw::Lzma::Encoder::STORABLE_freeze
{
    my $type = ref shift;
    croak "Cannot freeze $type object\n";
}

sub Compress::Raw::Lzma::Encoder::STORABLE_thaw
{
    my $type = ref shift;
    croak "Cannot thaw $type object\n";
}


@Compress::Raw::Lzma::EasyEncoder::ISA = qw(Compress::Raw::Lzma::Encoder);

sub Compress::Raw::Lzma::EasyEncoder::new
{
    my $pkg = shift ;
    my ($got) = ParseParameters(0,
            {
                'AppendOutput'  => [1, 1, Parse_boolean,  0],
                'Bufsize'       => [1, 1, Parse_unsigned, 16 * 1024],

                'Preset'        => [1, 1, Parse_unsigned, LZMA_PRESET_DEFAULT()],
                'Extreme'       => [1, 1, Parse_boolean, 0],
                'Check'         => [1, 1, Parse_unsigned, LZMA_CHECK_CRC32()],
            }, @_) ;


#    croak "Compress::Raw::Lzma::EasyEncoder::new: Bufsize must be >= 1, you specified " .
#            $got->value('Bufsize')
#        unless $got->value('Bufsize') >= 1;

    my $flags = 0 ;
    $flags |= FLAG_APPEND if $got->value('AppendOutput') ;

    my $preset = $got->value('Preset');

    if ($got->value('Extreme')) {
        $preset |= LZMA_PRESET_EXTREME();
    }

    lzma_easy_encoder($pkg, $flags,
                $got->value('Bufsize'),
                $preset,
                $got->value('Check')) ;

}

@Compress::Raw::Lzma::AloneEncoder::ISA = qw(Compress::Raw::Lzma::Encoder);

sub Compress::Raw::Lzma::AloneEncoder::new
{
    my $pkg = shift ;
    my ($got) = ParseParameters(0,
            {
                'AppendOutput'  => [1, 1, Parse_boolean,  0],
                'Bufsize'       => [1, 1, Parse_unsigned, 16 * 1024],
                'Filter'        => [1, 1, Parse_any, [] ],

            }, @_) ;


    my $flags = 0 ;
    $flags |= FLAG_APPEND if $got->value('AppendOutput') ;

    my $filters = Lzma::Filters::validateFilters(1, 0, $got->value('Filter')) ;
    # TODO - check max of 1 filter & it is a reference to Lzma::Filter::Lzma1

    lzma_alone_encoder($pkg, $flags,
                       $got->value('Bufsize'),
                       $filters);

}

@Compress::Raw::Lzma::StreamEncoder::ISA = qw(Compress::Raw::Lzma::Encoder);

sub Compress::Raw::Lzma::StreamEncoder::new
{
    my $pkg = shift ;
    my ($got) = ParseParameters(0,
            {
                'AppendOutput'  => [1, 1, Parse_boolean,  0],
                'Bufsize'       => [1, 1, Parse_unsigned, 16 * 1024],
                'Filter'        => [1, 1, Parse_any, [] ],
                'Check'         => [1, 1, Parse_unsigned, LZMA_CHECK_CRC32()],

            }, @_) ;


    my $flags = 0 ;
    $flags |= FLAG_APPEND if $got->value('AppendOutput') ;

    my $filters = Lzma::Filters::validateFilters(1, 1, $got->value('Filter')) ;

    lzma_stream_encoder($pkg, $flags,
                        $got->value('Bufsize'),
                        $filters,
                        $got->value('Check'));

}

@Compress::Raw::Lzma::RawEncoder::ISA = qw(Compress::Raw::Lzma::Encoder);

sub Compress::Raw::Lzma::RawEncoder::new
{
    my $pkg = shift ;
    my ($got) = ParseParameters(0,
            {
                'ForZip'        => [1, 1, Parse_boolean,  0],
                'AppendOutput'  => [1, 1, Parse_boolean,  0],
                'Bufsize'       => [1, 1, Parse_unsigned, 16 * 1024],
                'Filter'        => [1, 1, Parse_any, [] ],

            }, @_) ;


    my $flags = 0 ;
    $flags |= FLAG_APPEND if $got->value('AppendOutput') ;

    my $forZip = $got->value('ForZip');

    my $filters = Lzma::Filters::validateFilters(1, ! $forZip, $got->value('Filter')) ;

    lzma_raw_encoder($pkg, $flags,
                        $got->value('Bufsize'),
                        $filters,
                        $forZip);

}

@Compress::Raw::Lzma::AutoDecoder::ISA = qw(Compress::Raw::Lzma::Decoder);

sub Compress::Raw::Lzma::AutoDecoder::new
{
    my $pkg = shift ;
    my ($got) = ParseParameters(0,
                    {
                        'AppendOutput'  => [1, 1, Parse_boolean,  0],
                        'LimitOutput'   => [1, 1, Parse_boolean,  0],
                        'ConsumeInput'  => [1, 1, Parse_boolean,  1],
                        'Bufsize'       => [1, 1, Parse_unsigned, 16 * 1024],

                        'MemLimit'      => [1, 1, Parse_unsigned, 128 *1024 *1024],

            }, @_) ;


    my $flags = 0 ;
    $flags |= FLAG_APPEND if $got->value('AppendOutput') ;
    $flags |= FLAG_CONSUME_INPUT if $got->value('ConsumeInput') ;
    $flags |= FLAG_LIMIT_OUTPUT if $got->value('LimitOutput') ;

    lzma_auto_decoder($pkg, $flags, $got->value('MemLimit'));
}

@Compress::Raw::Lzma::AloneDecoder::ISA = qw(Compress::Raw::Lzma::Decoder);

sub Compress::Raw::Lzma::AloneDecoder::new
{
    my $pkg = shift ;
    my ($got) = ParseParameters(0,
                    {
                        'AppendOutput'  => [1, 1, Parse_boolean,  0],
                        'LimitOutput'   => [1, 1, Parse_boolean,  0],
                        'ConsumeInput'  => [1, 1, Parse_boolean,  1],
                        'Bufsize'       => [1, 1, Parse_unsigned, 16 * 1024],

                        'MemLimit'      => [1, 1, Parse_unsigned, 128 *1024 *1024],

            }, @_) ;


    my $flags = 0 ;
    $flags |= FLAG_APPEND if $got->value('AppendOutput') ;
    $flags |= FLAG_CONSUME_INPUT if $got->value('ConsumeInput') ;
    $flags |= FLAG_LIMIT_OUTPUT if $got->value('LimitOutput') ;

    lzma_alone_decoder($pkg,
                       $flags,
                       $got->value('Bufsize'),
                       $got->value('MemLimit'));
}

@Compress::Raw::Lzma::StreamDecoder::ISA = qw(Compress::Raw::Lzma::Decoder);

sub Compress::Raw::Lzma::StreamDecoder::new
{
    my $pkg = shift ;
    my ($got) = ParseParameters(0,
                    {
                        'AppendOutput'  => [1, 1, Parse_boolean,  0],
                        'LimitOutput'   => [1, 1, Parse_boolean,  0],
                        'ConsumeInput'  => [1, 1, Parse_boolean,  1],
                        'Bufsize'       => [1, 1, Parse_unsigned, 16 * 1024],

                        'MemLimit'      => [1, 1, Parse_unsigned, 128 *1024 *1024],
                        'Flags'         => [1, 1, Parse_unsigned, 0],

            }, @_) ;


    my $flags = 0 ;
    $flags |= FLAG_APPEND if $got->value('AppendOutput') ;
    $flags |= FLAG_CONSUME_INPUT if $got->value('ConsumeInput') ;
    $flags |= FLAG_LIMIT_OUTPUT if $got->value('LimitOutput') ;

    lzma_stream_decoder($pkg,
                        $flags,
                        $got->value('Bufsize'),
                        $got->value('MemLimit'),
                        $got->value('Flags'));
}

@Compress::Raw::Lzma::RawDecoder::ISA = qw(Compress::Raw::Lzma::Decoder);

sub Compress::Raw::Lzma::RawDecoder::new
{
    my $pkg = shift ;
    my ($got) = ParseParameters(0,
                    {
                        'AppendOutput'  => [1, 1, Parse_boolean,  0],
                        'LimitOutput'   => [1, 1, Parse_boolean,  0],
                        'ConsumeInput'  => [1, 1, Parse_boolean,  1],
                        'Bufsize'       => [1, 1, Parse_unsigned, 16 * 1024],
                        'Filter'        => [1, 1, Parse_any, [] ],
                        'Properties'    => [1, 1, Parse_any,  undef],
            }, @_) ;


    my $flags = 0 ;
    $flags |= FLAG_APPEND if $got->value('AppendOutput') ;
    $flags |= FLAG_CONSUME_INPUT if $got->value('ConsumeInput') ;
    $flags |= FLAG_LIMIT_OUTPUT if $got->value('LimitOutput') ;

    my $filters = Lzma::Filters::validateFilters(0, ! defined $got->value('Properties'),
                            $got->value('Filter')) ;

    lzma_raw_decoder($pkg,
                        $flags,
                        $got->value('Bufsize'),
                        $filters,
                        $got->value('Properties'));
}

# LZMA1/2
#   Preset
#   Dict
#   Lc
#   Lp
#   Pb
#   Mode LZMA_MODE_FAST, LZMA_MODE_NORMAL
#   Nice
#   Mf LZMA_MF_HC3 LZMA_MF_HC4 LZMA_MF_BT2 LZMA_MF_BT3 LZMA_MF_BT4
#   Depth

# BCJ
#   LZMA_FILTER_X86
#   LZMA_FILTER_POWERPC
#   LZMA_FILTER_IA64
#   LZMA_FILTER_ARM
#   LZMA_FILTER_ARMTHUMB
#   LZMA_FILTER_SPARC
#
#   BCJ => LZMA_FILTER_X86 -- this assumes offset is 0
#   BCJ => [LZMA_FILTER_X86, offset]

# Delta
#    Dist 1 - 256, 1

# Subblock
#    Size
#    RLE
#    Align

# Preset (0-9) LZMA_PRESET_EXTREME LZMA_PRESET_DEFAULT -- call lzma_lzma_preset

# Memory

# Check => LZMA_CHECK_NONE, LZMA_CHECK_CRC32, LZMA_CHECK_CRC64, LZMA_CHECK_SHA256

# my $bool = lzma_check_is_supported(LZMA_CHECK_CRC32);
# my $int = lzma_check_size(LZMA_CHECK_CRC32);
# my $int = $lzma->lzma_get_check();




#sub Compress::Raw::Lzma::new
#{
#    my $class = shift ;
#    my ($ptr, $status) = _new(@_);
#    return wantarray ? (undef, $status) : undef
#        unless $ptr ;
#    my $obj = bless [$ptr], $class ;
#    return wantarray ? ($obj, $status) : $obj;
#}
#
#package Compress::Raw::UnLzma ;
#
#sub Compress::Raw::UnLzma::new
#{
#    my $class = shift ;
#    my ($ptr, $status) = _new(@_);
#    return wantarray ? (undef, $status) : undef
#        unless $ptr ;
#    my $obj = bless [$ptr], $class ;
#    return wantarray ? ($obj, $status) : $obj;
#}


sub Lzma::Filters::validateFilters
{
    use UNIVERSAL ;
    use Scalar::Util qw(blessed );

    my $encoding = shift; # not decoding
    my $lzma2 = shift;

    # my $objType = $lzma2 ? "Lzma::Filter::Lzma2"
    #                      : "Lzma::Filter::Lzma" ;

    my $objType =  "Lzma::Filter::Lzma" ;

    # if only one, convert into an array reference
    if (blessed $_[0] )  {
        die "filter object $_[0] is not an $objType object"
            unless UNIVERSAL::isa($_[0], $objType);

            #$_[0] = [ $_[0] ] ;
        return [ $_[0] ] ;
    }

    if (ref $_[0] ne 'ARRAY')
      { die "$_[0] not Lzma::Filter object or ARRAY ref" }

    my $filters = $_[0] ;
    my $count = @$filters;

    # check number of filters
    die sprintf "Too many filters ($count), max is %d", LZMA_FILTERS_MAX()
        if $count > LZMA_FILTERS_MAX();

    # TODO - add more tests here
    # Check that all filters inherit from Lzma::Filter
    # check that filters are supported
    # check memory requirements
    # need exactly one lzma1/2 filter
    # lzma1/2 is the last thing in the list
    for (my $i = 0; $i <  @$filters ; ++$i)
    {
        my $filt = $filters->[$i];
        die "filter is not an Lzma::Filter object"
            unless UNIVERSAL::isa($filt, 'Lzma::Filter');
        die "Lzma filter must be last"
            if UNIVERSAL::isa($filt, 'Lzma::Filter::Lzma') && $i < $count -1 ;

        #die "xxx" unless lzma_filter_encoder_is_supported($filt->id());
    }

    if (@$filters == 0)
    {
        push @$filters, $lzma2 ? Lzma::Filter::Lzma2()
                               : Lzma::Filter::Lzma1();
    }

    return $filters;
}

#package Lzma::Filter;
#package Lzma::Filter::Lzma;

#our ($VERSION, @ISA, @EXPORT, $AUTOLOAD);
@Lzma::Filter::Lzma::ISA = qw(Lzma::Filter);

sub Lzma::Filter::Lzma::mk
{
    my $type = shift;

    my $got = Compress::Raw::Lzma::ParseParameters(0,
        {
            'DictSize' => [1, 1, Parse_unsigned(), LZMA_DICT_SIZE_DEFAULT()],
            'PresetDict' => [1, 1, Parse_string(), undef],
            'Lc'    => [1, 1, Parse_unsigned(), LZMA_LC_DEFAULT()],
            'Lp'    => [1, 1, Parse_unsigned(), LZMA_LP_DEFAULT()],
            'Pb'    => [1, 1, Parse_unsigned(), LZMA_PB_DEFAULT()],
            'Mode'  => [1, 1, Parse_unsigned(), LZMA_MODE_NORMAL()],
            'Nice'  => [1, 1, Parse_unsigned(), 64],
            'Mf'    => [1, 1, Parse_unsigned(), LZMA_MF_BT4()],
            'Depth' => [1, 1, Parse_unsigned(), 0],
        }, @_) ;

    my $pkg = (caller(1))[3] ;

    my $DictSize = $got->value('DictSize');
    die "Dictsize $DictSize not in range 4KiB - 1536Mib"
        if $DictSize < 1024 * 4 ||
           $DictSize > 1024 * 1024 * 1536 ;

    my $Lc = $got->value('Lc');
    die "Lc $Lc not in range 0-4"
        if $Lc < 0 || $Lc > 4;

    my $Lp = $got->value('Lp');
    die "Lp $Lp not in range 0-4"
        if $Lp < 0 || $Lp > 4;

    die "Lc + Lp must be <= 4"
        if $Lc + $Lp > 4;

    my $Pb = $got->value('Pb');
    die "Pb $Pb not in range 0-4"
        if $Pb < 0 || $Pb > 4;

    my $Mode = $got->value('Mode');
    die "Mode $Mode not LZMA_MODE_FAST or LZMA_MODE_NORMAL"
        if $Mode != LZMA_MODE_FAST() && $Mode != LZMA_MODE_NORMAL();

    my $Mf = $got->value('Mf');
    die "Mf $Mf not valid"
        if ! grep { $Mf == $_ }
             ( LZMA_MF_HC3(),
               LZMA_MF_HC4(),
               LZMA_MF_BT2(),
               LZMA_MF_BT3(),
               LZMA_MF_BT4());

    my $Nice = $got->value('Nice');
    die "Nice $Nice not in range 2-273"
        if $Nice < 2 || $Nice > 273;

    my $obj = Lzma::Filter::Lzma::_mk($type,
                            $DictSize,
                            $Lc,
                            $Lp,
                            $Pb,
                            $Mode,
                            $Nice,
                            $Mf,
                            $got->value('Depth'),
                            $got->value('PresetDict'),
                        );

    bless $obj, $pkg
        if defined $obj;

    $obj;
}

sub Lzma::Filter::Lzma::mkPreset
{
    my $type = shift;

    my $preset = shift;
    my $pkg = (caller(1))[3] ;

    my $obj = Lzma::Filter::Lzma::_mkPreset($type, $preset);

    bless $obj, $pkg
        if defined $obj;

    $obj;
}

@Lzma::Filter::Lzma1::ISA = qw(Lzma::Filter::Lzma);
sub Lzma::Filter::Lzma1
{
    Lzma::Filter::Lzma::mk(0, @_);
}

@Lzma::Filter::Lzma1::Preset::ISA = qw(Lzma::Filter::Lzma);
sub Lzma::Filter::Lzma1::Preset
{
    Lzma::Filter::Lzma::mkPreset(0, @_);
}

@Lzma::Filter::Lzma2::ISA = qw(Lzma::Filter::Lzma);
sub Lzma::Filter::Lzma2
{
    Lzma::Filter::Lzma::mk(1, @_);
}

@Lzma::Filter::Lzma2::Preset::ISA = qw(Lzma::Filter::Lzma);
sub Lzma::Filter::Lzma2::Preset
{
    Lzma::Filter::Lzma::mkPreset(1, @_);
}

@Lzma::Filter::BCJ::ISA = qw(Lzma::Filter);

sub Lzma::Filter::BCJ::mk
{
    my $type = shift;
    my $got = Compress::Raw::Lzma::ParseParameters(0,
            {
                'Offset' => [1, 1, Parse_unsigned(), 0],
            }, @_) ;

    my $pkg = (caller(1))[3] ;
    my $obj = Lzma::Filter::BCJ::_mk($type, $got->value('Offset')) ;
    bless $obj, $pkg
        if defined $obj;

    $obj;
}

@Lzma::Filter::X86::ISA = qw(Lzma::Filter::BCJ);

sub Lzma::Filter::X86
{
    Lzma::Filter::BCJ::mk(LZMA_FILTER_X86(), @_);
}

@Lzma::Filter::PowerPC::ISA = qw(Lzma::Filter::BCJ);

sub Lzma::Filter::PowerPC
{
    Lzma::Filter::BCJ::mk(LZMA_FILTER_POWERPC(), @_);
}

@Lzma::Filter::IA64::ISA = qw(Lzma::Filter::BCJ);

sub Lzma::Filter::IA64
{
    Lzma::Filter::BCJ::mk(LZMA_FILTER_IA64(), @_);
}

@Lzma::Filter::ARM::ISA = qw(Lzma::Filter::BCJ);

sub Lzma::Filter::ARM
{
    Lzma::Filter::BCJ::mk(LZMA_FILTER_ARM(), @_);
}

@Lzma::Filter::ARMThumb::ISA = qw(Lzma::Filter::BCJ);

sub Lzma::Filter::ARMThumb
{
    Lzma::Filter::BCJ::mk(LZMA_FILTER_ARMTHUMB(), @_);
}

@Lzma::Filter::Sparc::ISA = qw(Lzma::Filter::BCJ);

sub Lzma::Filter::Sparc
{
    Lzma::Filter::BCJ::mk(LZMA_FILTER_SPARC(), @_);
}


@Lzma::Filter::Delta::ISA = qw(Lzma::Filter);
sub Lzma::Filter::Delta
{
    #my $pkg = shift ;
    my ($got) = Compress::Raw::Lzma::ParseParameters(0,
            {
                'Type'   => [1, 1, Parse_unsigned,  LZMA_DELTA_TYPE_BYTE()],
                'Distance' => [1, 1, Parse_unsigned, LZMA_DELTA_DIST_MIN()],
            }, @_) ;

    Lzma::Filter::Delta::_mk($got->value('Type'),
                             $got->value('Distance')) ;
}

#package Lzma::Filter::SubBlock;


package Compress::Raw::Lzma;

1;

__END__


=head1 NAME

Compress::Raw::Lzma - Low-Level Interface to lzma compression library

=head1 SYNOPSIS

    use Compress::Raw::Lzma ;

    # Encoders
    my ($lz, $status) = new Compress::Raw::Lzma::EasyEncoder [OPTS]
        or die "Cannot create lzma object: $status\n";

    my ($lz, $status) = new Compress::Raw::Lzma::AloneEncoder [OPTS]
        or die "Cannot create lzma object: $status\n";

    my ($lz, $status) = new Compress::Raw::Lzma::StreamEncoder [OPTS]
        or die "Cannot create lzma object: $status\n";

    my ($lz, $status) = new Compress::Raw::Lzma::RawEncoder [OPTS]
        or die "Cannot create lzma object: $status\n";

    $status = $lz->code($input, $output);
    $status = $lz->flush($output);

    # Decoders
    my ($lz, $status) = new Compress::Raw::Lzma::AloneDecoder [OPTS]
        or die "Cannot create bunzip2 object: $status\n";

    my ($lz, $status) = new Compress::Raw::Lzma::AutoDecoder [OPTS]
        or die "Cannot create bunzip2 object: $status\n";

    my ($lz, $status) = new Compress::Raw::Lzma::StreamDecoder [OPTS]
        or die "Cannot create bunzip2 object: $status\n";

    my ($lz, $status) = new Compress::Raw::Lzma::RawDecoder [OPTS]
        or die "Cannot create bunzip2 object: $status\n";

    $status = $lz->code($input, $output);

    my $version = Compress::Raw::Lzma::lzma_version_number();
    my $version = Compress::Raw::Lzma::lzma_version_string();

=head1 DESCRIPTION

C<Compress::Raw::Lzma> provides an interface to the in-memory
compression/uncompression functions from the lzma compression library.

Although the primary purpose for the existence of C<Compress::Raw::Lzma> is
for use by the  C<IO::Compress::Lzma>, C<IO::Uncompress::UnLzma>,
C<IO::Compress::Xz> and C<IO::Uncompress::UnXz> modules, it can be used on
its own for simple compression/uncompression tasks.

There are two functions, called C<code> and C<flush>, used in all the
compression and uncompression interfaces defined in this module. By default
both of these functions overwrites any data stored in its output buffer
parameter. If you want to compress/uncompress to a single buffer, and have
C<code> and C<flush> append to that buffer, enable the C<AppendOutput>
option when you create the compression/decompression object.

=head1 Compression

There are four compression interfaces available in this module.

=over 5

=item Compress::Raw::Lzma::EasyEncoder
=item Compress::Raw::Lzma::AloneEncoder
=item Compress::Raw::Lzma::StreamEncoder
=item Compress::Raw::Lzma::RawEncoder

=back

=head2 ($z, $status) = new Compress::Raw::Lzma::EasyEncoder [OPTS];

Creates a new I<xz> compression object.

If successful, it will return the initialised compression object, C<$z>
and a C<$status> of C<LZMA_OK> in a list context. In scalar context it
returns the deflation object, C<$z>, only.

If not successful, the returned compression object, C<$z>, will be
I<undef> and C<$status> will hold the an I<lzma> error code.

Below is a list of the valid options:

=over 5

=item B<< Preset => $preset >>

Used to choose the compression preset.

Valid values are 0-9 and C<LZMA_PRESET_DEFAULT>.

0 is the fastest compression with the lowest memory usage and the lowest
compression.

9 is the slowest compression with the highest memory usage but with the best
compression.

Defaults to C<LZMA_PRESET_DEFAULT>.

=item B<< Extreme => 0|1 >>

Makes the compression a lot slower, but a small compression gain.

Defaults to 0.

=item B<< Check => $check >>

Used to specify the integrity check used in the xz data stream.
Valid values are C<LZMA_CHECK_NONE>, C<LZMA_CHECK_CRC32>,
C<LZMA_CHECK_CRC64>, C<LZMA_CHECK_SHA256>.

Defaults to C<LZMA_CHECK_CRC32>.

=item B<< AppendOutput => 0|1 >>

Controls whether the compressed data is appended to the output buffer in
the C<code> and C<flush> methods.

Defaults to 0.
(Note in versions of this module prior to 2.072 the default value was
incorrectly documented as 1).

=item B<< BufSize => $number >>

Sets the initial size for the output buffer used by the C<$d-E<gt>code>
method. If the buffer has to be reallocated to increase the size, it will
grow in increments of C<Bufsize>.

Defaults to 16k.

=back

=head2 ($z, $status) = new Compress::Raw::Lzma::AloneEncoder [OPTS];

Creates a legacy I<lzma> compression object. This format is also know as
lzma_alone.

If successful, it will return the initialised compression object, C<$z>
and a C<$status> of C<LZMA_OK> in a list context. In scalar context it
returns the deflation object, C<$z>, only.

If not successful, the returned compression object, C<$z>, will be
I<undef> and C<$status> will hold the an I<lzma> error code.

Below is a list of the valid options:

=over 5

=item B<< Filter => $filter >>

The C< $filter > option must be an object of type C<Lzma::Filter::Lzma1>.
See L<Compress::Raw::Lzma/Lzma::Filter::Lzma> for a definition
of C<Lzma::Filter::Lzma1>.

If this option is not present an C<Lzma::Filter::Lzma1> object with default
values will be used.

=item B<< AppendOutput => 0|1 >>

Controls whether the compressed data is appended to the output buffer in
the C<code> and C<flush> methods.

Defaults to 0.
(Note in versions of this module prior to 2.072 the default value was
incorrectly documented as 1).

=item B<< BufSize => $number >>

Sets the initial size for the output buffer used by the C<$d-E<gt>code>
method. If the buffer has to be reallocated to increase the size, it will
grow in increments of C<Bufsize>.

Defaults to 16k.

=back

=head2 ($z, $status) = new Compress::Raw::Lzma::StreamEncoder [OPTS];

Creates a I<xz> compression object.

If successful, it will return the initialised compression object, C<$z>
and a C<$status> of C<LZMA_OK> in a list context. In scalar context it
returns the deflation object, C<$z>, only.

If not successful, the returned compression object, C<$z>, will be
I<undef> and C<$status> will hold the an I<lzma> error code.

Below is a list of the valid options:

=over 5

=item B<< Filter => $filter >>
=item B<< Filter => [$filter1, $filter2,...] >>

This option is used to change the bahaviour of the StreamEncoder by
applying between one and C<LZMA_FILTERS_MAX> filters to the data stream
during compression. See L</Filters> for more details on the available
filters.

If this option is present it must either contain a single
C<Lzma::Filter::Lzma> filter object or an array reference containing between
one and C<LZMA_FILTERS_MAX> filter objects.

If this option is not present an C<Lzma::Filter::Lzma2> object with default
values will be used.

=item B<< Check => $check >>

Used to specify the integrity check used in the xz data stream.
Valid values are C<LZMA_CHECK_NONE>, C<LZMA_CHECK_CRC32>,
C<LZMA_CHECK_CRC64>, C<LZMA_CHECK_SHA256>.

Defaults to C<LZMA_CHECK_CRC32>.

=item B<< AppendOutput => 0|1 >>

Controls whether the compressed data is appended to the output buffer in
the C<code> and C<flush> methods.

Defaults to 0.
(Note in versions of this module prior to 2.072 the default value was
incorrectly documented as 1).

=item B<< BufSize => $number >>

Sets the initial size for the output buffer used by the C<$d-E<gt>code>
method. If the buffer has to be reallocated to increase the size, it will
grow in increments of C<Bufsize>.

Defaults to 16k.

=back

=head2 ($z, $status) = new Compress::Raw::Lzma::RawEncoder [OPTS];

Low level access to lzma.

If successful, it will return the initialised compression object, C<$z>
and a C<$status> of C<LZMA_OK> in a list context. In scalar context it
returns the deflation object, C<$z>, only.

If not successful, the returned compression object, C<$z>, will be
I<undef> and C<$status> will hold the an I<lzma> error code.

Below is a list of the valid options:

=over 5

=item B<< Filter => $filter >>
=item B<< Filter => [$filter1, $filter2,...] >>

This option is used to change the bahaviour of the RawEncoder by
applying between one and C<LZMA_FILTERS_MAX> filters to the data stream
during compression. See L</Filters> for more details on the available
filters.

If this option is present it must either contain a single
C<Lzma::Filter::Lzma> filter object or an array reference containing between
one and C<LZMA_FILTERS_MAX> filter objects.

If this option is not present an C<Lzma::Filter::Lzma2> object with default
values will be used.

=item B<< AppendOutput => 0|1 >>

Controls whether the compressed data is appended to the output buffer in
the C<code> and C<flush> methods.

Defaults to 0.
(Note in versions of this module prior to 2.072 the default value was
incorrectly documented as 1).

=item B<< BufSize => $number >>

Sets the initial size for the output buffer used by the C<$d-E<gt>code>
method. If the buffer has to be reallocated to increase the size, it will
grow in increments of C<Bufsize>.

Defaults to 16k.

=item B<< ForZip => 1/0 >>

This boolean option is used to enable prefixing the compressed data stream
with an encoded copy of the filter properties.

Defaults to 0.

=back

=head2 $status = $lz->code($input, $output);

Reads the contents of C<$input>, compresses it and writes the compressed
data to C<$output>.

Returns C<LZMA_OK> on success and an C<lzma> error code on failure.

If C<appendOutput> is enabled in the constructor for the lzma object, the
compressed data will be appended to C<$output>. If not enabled, C<$output>
will be truncated before the compressed data is written to it.

=head2 $status = $lz->flush($output, LZMA_FINISH);

Flushes any pending compressed data to C<$output>. By default it terminates
the compressed data stream.

Returns C<LZMA_OK> on success and an C<lzma> error code on failure.

=head2 Example

TODO

=head1 Uncompression

There are four uncompression interfaces available in this module.

=over 5

=item Compress::Raw::Lzma::AutoDecoder
=item Compress::Raw::Lzma::AloneDecoder
=item Compress::Raw::Lzma::StreamDecoder
=item Compress::Raw::Lzma::RawDecoder

=back

=head2 ($z, $status) = new Compress::Raw::Lzma::AutoDecoder [OPTS] ;

Create an object that can uncompress any of the compressed data streams
that can be created by this module.

If successful, it will return the initialised uncompression object, C<$z>
and a C<$status> of C<LZMA_OK> in a list context. In scalar context it
returns the deflation object, C<$z>, only.

If not successful, the returned uncompression object, C<$z>, will be
I<undef> and C<$status> will hold the an I<lzma> error code.

Below is a list of the valid options:

=over 5

=item B<-MemLimit>

The number of bytes to use when uncompressing.

Default is unlimited.

=item B<-Bufsize>

Sets the initial size for the output buffer used by the C<$i-E<gt>code>
method. If the output buffer in this method has to be reallocated to
increase the size, it will grow in increments of C<Bufsize>.

Default is 16k.

=item B<-AppendOutput>

This option controls how data is written to the output buffer by the
C<$i-E<gt>code> method.

If the option is set to false, the output buffer in the C<$i-E<gt>code>
method will be truncated before uncompressed data is written to it.

If the option is set to true, uncompressed data will be appended to the
output buffer by the C<$i-E<gt>code> method.

This option defaults to false.

=item B<-ConsumeInput>

If set to true, this option will remove compressed data from the input
buffer of the C<< $i->code >> method as the uncompression progresses.

This option can be useful when you are processing compressed data that is
embedded in another file/buffer. In this case the data that immediately
follows the compressed stream will be left in the input buffer.

This option defaults to true.

=item B<-LimitOutput>

The C<LimitOutput> option changes the behavior of the C<< $i->code >>
method so that the amount of memory used by the output buffer can be
limited.

When C<LimitOutput> is used the size of the output buffer used will either
be the value of the C<Bufsize> option or the amount of memory already
allocated to C<$output>, whichever is larger. Predicting the output size
available is tricky, so don't rely on getting an exact output buffer size.

When C<LimitOutout> is not specified C<< $i->code >> will use as much
memory as it takes to write all the uncompressed data it creates by
uncompressing the input buffer.

If C<LimitOutput> is enabled, the C<ConsumeInput> option will also be
enabled.

This option defaults to false.

See L</The LimitOutput option> for a discussion on why C<LimitOutput> is
needed and how to use it.

=back

=head2 ($z, $status) = new Compress::Raw::Lzma::AloneDecoder [OPTS] ;

Create an object that can uncompress an lzma_alone data stream.

If successful, it will return the initialised uncompression object, C<$z>
and a C<$status> of C<LZMA_OK> in a list context. In scalar context it
returns the deflation object, C<$z>, only.

If not successful, the returned uncompression object, C<$z>, will be
I<undef> and C<$status> will hold the an I<lzma> error code.

Below is a list of the valid options:

=over 5

=item B<-MemLimit>

The number of bytes to use when uncompressing.

Default is unlimited.

=item B<-Bufsize>

Sets the initial size for the output buffer used by the C<$i-E<gt>code>
method. If the output buffer in this method has to be reallocated to
increase the size, it will grow in increments of C<Bufsize>.

Default is 16k.

=item B<-AppendOutput>

This option controls how data is written to the output buffer by the
C<$i-E<gt>code> method.

If the option is set to false, the output buffer in the C<$i-E<gt>code>
method will be truncated before uncompressed data is written to it.

If the option is set to true, uncompressed data will be appended to the
output buffer by the C<$i-E<gt>code> method.

This option defaults to false.

=item B<-ConsumeInput>

If set to true, this option will remove compressed data from the input
buffer of the C<< $i->code >> method as the uncompression progresses.

This option can be useful when you are processing compressed data that is
embedded in another file/buffer. In this case the data that immediately
follows the compressed stream will be left in the input buffer.

This option defaults to true.

=item B<-LimitOutput>

The C<LimitOutput> option changes the behavior of the C<< $i->code >>
method so that the amount of memory used by the output buffer can be
limited.

When C<LimitOutput> is used the size of the output buffer used will either
be the value of the C<Bufsize> option or the amount of memory already
allocated to C<$output>, whichever is larger. Predicting the output size
available is tricky, so don't rely on getting an exact output buffer size.

When C<LimitOutout> is not specified C<< $i->code >> will use as much
memory as it takes to write all the uncompressed data it creates by
uncompressing the input buffer.

If C<LimitOutput> is enabled, the C<ConsumeInput> option will also be
enabled.

This option defaults to false.

See L</The LimitOutput option> for a discussion on why C<LimitOutput> is
needed and how to use it.

=back

=head2 $status = $z->code($input, $output);

Uncompresses C<$input> and writes the uncompressed data to C<$output>.

Returns C<LZMA_OK> if the uncompression was successful, but the end of the
compressed data stream has not been reached. Returns C<LZMA_STREAM_END> on
successful uncompression and the end of the compression stream has been
reached.

If C<consumeInput> is enabled in the constructor for the lzma object,
C<$input> will have all compressed data removed from it after
uncompression. On C<LZMA_OK> return this will mean that C<$input> will be an
empty string; when C<LZMA_STREAM_END> C<$input> will either be an empty
string or will contain whatever data immediately followed the compressed
data stream.

If C<appendOutput> is enabled in the constructor for the lzma object,
the uncompressed data will be appended to C<$output>. If not enabled,
C<$output> will be truncated before the uncompressed data is written to it.

=head1 Filters

TODO - more here

A number of the Lzma compression interfaces (namely
C<Compress::Raw::Lzma::StreamEncoder> &
C<Compress::Raw::Lzma::AloneEncoder>) and the raw lzma uncompression interface
make use of filters. These filters are used to change the behaviour of
compression (and raw uncompression).

All Lzma Filters are sub-classed from the C<Lzma::Filter> base-class.

=head2 Lzma::Filter::Lzma

The C<Lzma::Filter::Lzma> class is used to... TODO - more here

There are two subclasses of C<Lzma::Filter::Lzma>, namely
C<Lzma::Filter::Lzma1> and C<Lzma::Filter::Lzma2>.

The former is typically used with C<Compress::Raw::Lzma::AloneEncoder>.
The latter with C<Compress::Raw::Lzma::StreamEncoder>.

When using Lzma filters an C<Lzma::Filter::Lzma> I<must> be included and it
I<must> be the last filter in the chain. There can only be one
C<Lzma::Filter::Lzma> filter in any filter chain.

The C<Lzma::Filter::Lzma> construction takes the following options.

=over 5

=item DictSize => $value

Dictionary size in bytes. This controls
how many bytes of the recently processed
uncompressed data is kept in memory. The size of the dictionary must be at
least C<LZMA_DICT_SIZE_MIN>.

Defaults to C<LZMA_DICT_SIZE_DEFAULT>.

=item PresetDict => $dict

Provide an initial dictionary. This value is used to initialize the LZ77 history window.

This feature only works correctly with raw encoding and decoding.
You may not be able to decode other formats that have been encoded with a preset dictionary.

C<$dict> should contain typical strings that occur in the files being compressed,
with the most probably strings near the end fo the preset dictionary.

If C<$dict> is larger than C<DictSize>, only the last C<DictSize> bytes are processed.

=item Lc => $value

Number of literal context bits.

How many of the highest bits of the previous uncompressed
eight-bit byte (also known as `literal') are taken into
account when predicting the bits of the next literal.

C<$value> must be a number between C<LZMA_LCLP_MIN> and
C<LZMA_LCLP_MAX>.

Note the sum of the C<Lc> and C<Lp> options cannot exceed 4.

Defaults to C<LZMA_LC_DEFAULT>.

=item Lp => $value

Number of literal position bits.

How many of the lowest bits of the current position (number
of bytes from the beginning of the uncompressed data) in the
uncompressed data is taken into account when predicting the
bits of the next literal (a single eight-bit byte).

Defaults to C<LZMA_LP_DEFAULT>.

=item Pb => $value

Number of position bits

How many of the lowest bits of the current position in the
uncompressed data is taken into account when estimating
probabilities of matches. A match is a sequence of bytes for
which a matching sequence is found from the dictionary and
thus can be stored as distance-length pair.

C<$value> must be a number between C<LZMA_PB_MIN> and
C<LZMA_PB_MAX>.

Defaults to C<LZMA_PB_DEFAULT>.

=item Mode => $value

The Compression Mode. Valid values are C<LZMA_MODE_FAST> and
C<LZMA_MODE_NORMAL>.

Defaults to C<LZMA_MODE_NORMAL>.

=item Nice => $value

Nice length of a match

Defaults to 64.

=item Mf => $value

Defines which Match Finder to use. Valid values are C<LZMA_MF_HC3>
C<LZMA_MF_HC4>, C<LZMA_MF_BT2> C<LZMA_MF_BT3> and C<LZMA_MF_BT4>.

Defaults to C<LZMA_MF_BT4>.

=item Depth => $value

Maximum search depth in the match finder.

Defaults to 0.

=back

=head2 Lzma::Filter::BCJ

The sub-classes of C<Lzma::Filter::BCJ> are the
Branch/Call/Jump conversion filters. These filters are used to rewrite
executable binary code for a number of processor architectures.
None of these classes take any options.

=over 5

=item Lzma::Filter::X86

Filter for x86 binaries.

=item Lzma::Filter::PowerPC

Filter for Big endian PowerPC binaries.

=item Lzma::Filter::IA64

Filter for IA64 (Itanium) binaries.

=item Lzma::Filter::ARM

Filter for ARM binaries.

=item Lzma::Filter::ARMThumb

Filter for ARMThumb binaries.

=item Lzma::Filter::Sparc

Filter for Sparc binaries.

=back

=head2 Lzma::Filter::Delta

Usage is

    Lzma::Filter::Delta [OPTS]

=over 5

=item Type => $type

Defines the type of Delta calculation. The only available type (and
therefore the default) is
C<LZMA_DELTA_TYPE_BYTE>,

=item Distance => $value

Defines the Delta Distance. C<$value> must be a number between
C<LZMA_DELTA_DIST_MIN> and C<LZMA_DELTA_DIST_MAX>.

Default is C<LZMA_DELTA_DIST_MIN>.

=back

=head1 Misc

=head2 my $version = Compress::Raw::Lzma::lzma_version_number();

Returns the version of the underlying lzma library this module is using at
run-time as a number.

=head2 my $version = Compress::Raw::Lzma::lzma_version_string();

Returns the version of the underlying lzma library this module is using at
run-time as a string.

=head2 my $version = Compress::Raw::Lzma::LZMA_VERSION();

Returns the version of the underlying lzma library this module was using at
compile-time as a number.

=head2 my $version = Compress::Raw::Lzma::LZMA_VERSION_STRING();

Returns the version of the underlying lzma library this module was using at
compile-time as a string.

=head1 Constants

The following lzma constants are exported by this module

TODO - more here

=head1 SUPPORT

General feedback/questions/bug reports should be sent to
L<https://github.com/pmqs/Compress-Raw-Lzma/issues> (preferred) or
L<https://rt.cpan.org/Public/Dist/Display.html?Name=Compress-Raw-Lzma>.

=head1 SEE ALSO

L<Compress::Zlib>, L<IO::Compress::Gzip>, L<IO::Uncompress::Gunzip>, L<IO::Compress::Deflate>, L<IO::Uncompress::Inflate>, L<IO::Compress::RawDeflate>, L<IO::Uncompress::RawInflate>, L<IO::Compress::Bzip2>, L<IO::Uncompress::Bunzip2>, L<IO::Compress::Lzma>, L<IO::Uncompress::UnLzma>, L<IO::Compress::Xz>, L<IO::Uncompress::UnXz>, L<IO::Compress::Lzip>, L<IO::Uncompress::UnLzip>, L<IO::Compress::Lzop>, L<IO::Uncompress::UnLzop>, L<IO::Compress::Lzf>, L<IO::Uncompress::UnLzf>, L<IO::Compress::Zstd>, L<IO::Uncompress::UnZstd>, L<IO::Uncompress::AnyInflate>, L<IO::Uncompress::AnyUncompress>

L<IO::Compress::FAQ|IO::Compress::FAQ>

L<File::GlobMapper|File::GlobMapper>, L<Archive::Zip|Archive::Zip>,
L<Archive::Tar|Archive::Tar>,
L<IO::Zlib|IO::Zlib>

=head1 AUTHOR

This module was written by Paul Marquess, C<pmqs@cpan.org>.

=head1 MODIFICATION HISTORY

See the Changes file.

=head1 COPYRIGHT AND LICENSE

Copyright (c) 2005-2021 Paul Marquess. All rights reserved.

This program is free software; you can redistribute it and/or
modify it under the same terms as Perl itself.
